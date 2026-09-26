// Pépites editions under concurrency, with real database connections
// (docs/engineering/PEPITES_ARCHITECTURE.md §5.5 and §11).
//
// pgTAP runs in one session, so it cannot show two writers meeting. This file
// opens separate connections to a local stack and holds one transaction open
// while another connection tries the same week:
//
//   - two ticks at once give one run (the second exits: "busy");
//   - two publishes of one edition give one publication;
//   - a reader during an uncommitted publication sees the old state;
//   - a withdrawal and the publication of its correction run one after the
//     other (the correction then finds nothing to correct);
//   - a re-point and a publish of the same week run one after the other, in
//     either order.
//
// It is opt-in, like historical-performance-e2e-wire-format.test.ts. It
// writes rows that cannot be deleted (editions, runs and their moves are
// append-only by design), each run under fresh random ids, and it switches
// the Pépites settings to 'staff' for its own competition, restoring them
// afterwards. So it runs only when PEPITES_E2E_DB_URL names a disposable
// database:
//
//   PEPITES_E2E_DB_URL=postgres://postgres:postgres@127.0.0.1:55322/postgres \
//     bun test scripts/backend/pepites-editions-concurrency.test.ts
//
// CI's database-quality job runs it after the pgTAP suite, on its freshly
// reset stack. Set but unreachable, it fails rather than skipping.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const DB_URL = process.env.PEPITES_E2E_DB_URL || undefined;
const CONNECT_TIMEOUT_MS = 3_000;
const BLOCKED_CHECK_MS = 400;

if (!DB_URL) {
  console.info(
    "[pepites-editions-concurrency] Skipped: it writes append-only rows, so it runs only when " +
      "PEPITES_E2E_DB_URL names a disposable database (a local stack after `supabase db reset`).",
  );
}

const BASE = crypto.randomUUID().replaceAll("-", "").slice(0, 7);
const uid = (kind: number, n: number) =>
  `${BASE}${kind}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COMPETITION = uid(0, 1);
const SEASON = uid(1, 1);
const STAFF = uid(9, 1);
const sqlUid = (kind: number, expression: string) =>
  `('${BASE}${kind}-0000-4000-8000-' || lpad((${expression})::text, 12, '0'))::uuid`;

// Three connections: two writers and a reader. max: 1 keeps each one a
// single session, so "A holds, B waits" is literal.
let a: Bun.SQL | null = null;
let b: Bun.SQL | null = null;
let c: Bun.SQL | null = null;
let savedSettings: Record<string, unknown> | null = null;

function json(value: unknown): Record<string, unknown> {
  return (typeof value === "string" ? JSON.parse(value) : value) as Record<string, unknown>;
}

function db(connection: Bun.SQL | null): Bun.SQL {
  if (!connection) throw new Error("not connected");
  return connection;
}

async function connect(): Promise<Bun.SQL> {
  const candidate = new Bun.SQL({ url: DB_URL, max: 1 });
  try {
    await Promise.race([
      candidate`select 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT_MS),
      ),
    ]);
  } catch (error) {
    await candidate.end().catch(() => undefined);
    throw new Error(
      "[pepites-editions-concurrency] PEPITES_E2E_DB_URL is set, but its database did not answer " +
        `within ${CONNECT_TIMEOUT_MS}ms (${(error as Error).message}).`,
    );
  }
  return candidate;
}

/** The league of the pgTAP file: 8 teams of 14, rounds 1-6 declared. */
function seedSql(): string {
  return `
    insert into app.competitions (id, slug, name, competition_type)
    values ('${COMPETITION}', 'pepites-e2e-${BASE}', 'Pépites E2E ${BASE}', 'league');
    insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status)
    values ('${SEASON}', '${COMPETITION}', '2026/2027', '2026-07-01', '2027-06-30', true, 'active');
    insert into app.teams (id, slug, name, short_name)
    select ${sqlUid(2, "t")}, 'pepites-e2e-${BASE}-team-' || t, 'E2E Team ' || t, 'X' || t
    from generate_series(1, 8) t;
    insert into app.players (id, slug, full_name, display_name, position)
    select ${sqlUid(3, "(t - 1) * 14 + k")}, 'pepites-e2e-${BASE}-player-' || ((t - 1) * 14 + k),
      'E2E Player ' || ((t - 1) * 14 + k), 'X. ' || ((t - 1) * 14 + k),
      case when k = 1 then 'goalkeeper' when k <= 5 then 'defender' when k <= 9 then 'midfielder'
        else 'forward' end::app.football_position
    from generate_series(1, 8) t cross join generate_series(1, 14) k;
    select app_private.record_player_attribute_observation(
      ${sqlUid(3, "p")}, 'date_of_birth',
      case when p % 2 = 0 or (p % 14 = 1 and ((p - 1) / 14) % 2 = 0)
        then (date '2004-01-01' + p)::text else (date '1995-01-01' + p)::text end,
      null, 'provider', 'sportsmonks', 'pepites-e2e', '2026-08-01T00:00:00Z')
    from generate_series(1, 112) p;
    select app_private.resolve_player_attributes(array(select ${sqlUid(3, "n")} from generate_series(1, 112) n));
    insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
    select ${sqlUid(3, "(t - 1) * 14 + k")}, ${sqlUid(2, "t")}, '${SEASON}', '2026-07-01', true
    from generate_series(1, 8) t cross join generate_series(1, 14) k;
    insert into app.rounds (id, season_id, round_number, name)
    select ${sqlUid(4, "r")}, '${SEASON}', r, 'Journée ' || r from generate_series(1, 6) r;
  `;
}

/** A round's four fixtures, all finished and final, and every player's match. */
function roundSql(round: number): string {
  return `
    insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
      kickoff_at, provider_updated_at, status, home_score, away_score, finalized_at)
    select ${sqlUid(5, `${round} * 10 + i`)}, '${COMPETITION}', '${SEASON}', ${sqlUid(4, String(round))},
      ${sqlUid(2, "pairing.order_[i]")}, ${sqlUid(2, "pairing.order_[9 - i]")},
      kickoff, kickoff + interval '2 hours', 'finished',
      (${round} * 3 + i) % 3, (${round} + i * 2) % 2, kickoff + interval '2 hours'
    from (
      select array[1] || array_agg(((x - 2 + ${round} - 1) % 7) + 2 order by x) as order_
      from generate_series(2, 8) x
    ) pairing
    cross join generate_series(1, 4) i
    cross join lateral (
      select timestamptz '2026-08-30 16:00:00+00' + interval '7 days' * ${round} + interval '1 hour' * i as kickoff
    ) times;

    insert into app.player_fixture_performances (
      football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
      started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
      penalties_missed, yellow_cards, red_cards, second_yellow_dismissals, own_goals, provider_rating,
      provider_observed_at
    )
    select fixture.season_id, fixture.id, player.id, side.team_id, player.position, 'sportsmonks',
      'sportsmonks:' || encode(extensions.digest(fixture.id::text || player.id::text, 'sha256'), 'hex'),
      k <= 11, true, case when k <= 11 then 90 else 15 end,
      case when k >= 7 and (p + ${round}) % 5 = 0 then 1 else 0 end,
      case when k >= 5 and (p * 3 + ${round}) % 7 = 0 then 1 else 0 end,
      0, 0, case when k = 1 then (p + ${round}) % 5 else 0 end, 0, 0, 0, 0, 0, 0,
      6.0 + ((p * 7 + ${round} * 3) % 25) / 10.0, fixture.finalized_at
    from app.fixtures fixture
    cross join lateral (values (fixture.home_team_id), (fixture.away_team_id)) side(team_id)
    cross join generate_series(1, 14) k
    cross join lateral (
      select ((substring(side.team_id::text from 25))::integer - 1) * 14 + k as p
    ) numbering
    join app.players player on player.id = ${sqlUid(3, "numbering.p")}
    where fixture.round_id = ${sqlUid(4, String(round))};
  `;
}

/** Changes one appearance of a round, so the next tick makes a new revision. */
function correctionSql(round: number, player: number): string {
  return `
    update app.player_fixture_performances set goals = goals + 1
    where fixture_id in (select id from app.fixtures where round_id = ${sqlUid(4, String(round))})
      and player_id = ${sqlUid(3, String(player))};
  `;
}

async function tick(connection: Bun.SQL, at: string): Promise<Record<string, unknown>> {
  const [row] = await connection`select app_private.pepites_tick(${at}::timestamptz) as result`;
  return json(row.result);
}

async function publish(connection: Bun.SQL, editionId: string): Promise<Record<string, unknown>> {
  const [row] = await connection`
    select app_private.pepites_publish_edition(${editionId}::uuid, ${STAFF}::uuid) as result`;
  return json(row.result);
}

async function editionState(editionId: string) {
  const [row] = await db(c)`
    select status, run_id from app.pepites_editions where id = ${editionId}::uuid`;
  return row as { status: string; run_id: string };
}

/**
 * Runs `hold` in a transaction on A and keeps it open. Returns a function
 * that commits it (or rolls it back) and waits for the end.
 */
async function holdOpen(
  work: (tx: Bun.SQL) => Promise<unknown>,
): Promise<{ result: unknown; finish: (commit: boolean) => Promise<void> }> {
  let release!: (commit: boolean) => void;
  const released = new Promise<boolean>((resolve) => (release = resolve));
  let started!: (value: unknown) => void;
  let failed!: (error: unknown) => void;
  const ready = new Promise<unknown>((resolve, reject) => {
    started = resolve;
    failed = reject;
  });
  const done = db(a)
    .begin(async (tx) => {
      const result = await work(tx as unknown as Bun.SQL);
      started(result);
      if (!(await released)) throw new Error("rollback requested");
    })
    .catch((error: Error) => {
      failed(error);
      if (error.message !== "rollback requested") throw error;
    });
  const result = await ready;
  return {
    result,
    finish: async (commit: boolean) => {
      release(commit);
      await done;
    },
  };
}

/** Whether a promise is still pending after a short wait. */
async function stillWaiting(promise: Promise<unknown>): Promise<boolean> {
  const marker = Symbol("pending");
  const outcome = await Promise.race([
    promise.then(
      () => "settled",
      () => "settled",
    ),
    new Promise((resolve) => setTimeout(() => resolve(marker), BLOCKED_CHECK_MS)),
  ]);
  return outcome === marker;
}

/** Sessions waiting on a lock whose current statement mentions `text`. */
async function waitingOnLock(text: string): Promise<number> {
  const [row] = await db(c)`
    select count(*)::integer as n from pg_stat_activity
    where wait_event_type = 'Lock' and query like ${"%" + text + "%"} and pid <> pg_backend_pid()`;
  return row.n as number;
}

async function publishedMoves(editionId: string): Promise<number> {
  const [row] = await db(c)`
    select count(*)::integer as n from app_private.pepites_edition_moves
    where edition_id = ${editionId}::uuid and to_status = 'published'`;
  return row.n as number;
}

async function scheduleFor(editionId: string, at: string): Promise<void> {
  await db(
    c,
  )`select app_private.pepites_schedule(${editionId}::uuid, ${at}::timestamptz, ${STAFF}::uuid)`;
}

const describeDb = DB_URL ? describe : describe.skip;

beforeAll(async () => {
  if (!DB_URL) return;
  a = await connect();
  b = await connect();
  c = await connect();
  const [settings] =
    await c`select to_jsonb(s) as settings from app_private.pepites_settings s where id`;
  savedSettings = json(settings.settings);
  await c.unsafe(seedSql());
  for (const round of [1, 2, 3, 4]) await c.unsafe(roundSql(round));
  await c`select app_private.pepites_configure('staff', false, ${COMPETITION}::uuid)`;
});

afterAll(async () => {
  if (c && savedSettings) {
    await c`
      update app_private.pepites_settings set
        mode = ${savedSettings.mode as string},
        auto_publish = ${savedSettings.auto_publish as boolean},
        competition_id = ${(savedSettings.competition_id as string | null) ?? null}::uuid,
        last_daily_on = ${(savedSettings.last_daily_on as string | null) ?? null}::date
      where id`;
  }
  await Promise.all([a?.end(), b?.end(), c?.end()]);
});

describeDb("Pépites editions with two writers", () => {
  let week14 = "";
  let week15 = "";

  it("two ticks at once give one run: the second exits at once", async () => {
    const held = await holdOpen((tx) => tick(tx, "2026-09-28 10:00:00+00"));
    expect((held.result as Record<string, unknown>).runs).toMatchObject({
      run: "scored",
      round: 4,
    });

    const started = performance.now();
    const second = await tick(db(b), "2026-09-28 10:00:00+00");
    expect(second).toEqual({ outcome: "busy" });
    expect(performance.now() - started).toBeLessThan(2_000);

    await held.finish(true);
    const [row] = await db(c)`
      select count(*)::integer as n from app.pepites_runs where season_id = ${SEASON}::uuid`;
    expect(row.n).toBe(1);
    expect((await tick(db(b), "2026-09-28 10:15:00+00")).runs).toMatchObject({ run: "unchanged" });
  });

  it("two publishes of one edition give one publication; a reader meanwhile sees the old state", async () => {
    const draft = await tick(db(b), "2026-09-28 11:15:00+00");
    expect(draft.draft).toBe("created");
    week14 = draft.editionId as string;
    await scheduleFor(week14, "2026-09-28 19:00:00+00");

    const held = await holdOpen((tx) => publish(tx, week14));
    expect(held.result).toMatchObject({ status: "published", alreadyPublished: false });

    const second = publish(db(b), week14);
    expect(await stillWaiting(second)).toBe(true);
    expect(await waitingOnLock("pepites_publish_edition")).toBe(1);
    expect((await editionState(week14)).status).toBe("scheduled");

    await held.finish(true);
    expect(await second).toMatchObject({ status: "published", alreadyPublished: true });
    expect(await publishedMoves(week14)).toBe(1);
    expect((await editionState(week14)).status).toBe("published");
  });

  it("a publication rolled back leaves the reader where it was", async () => {
    const [row] = await db(c)`
      select app_private.pepites_create_correction(${week14}::uuid, ${STAFF}::uuid) as id`;
    const correction = row.id as string;
    await scheduleFor(correction, "2026-09-29 09:00:00+00");

    const held = await holdOpen((tx) => publish(tx, correction));
    expect(held.result).toMatchObject({ status: "published", supersededEditionId: week14 });
    expect((await editionState(week14)).status).toBe("published");
    await held.finish(false);
    expect((await editionState(week14)).status).toBe("published");
    expect((await editionState(correction)).status).toBe("scheduled");

    // A withdrawal and the correction's publication, same week: one after
    // the other. The correction then has nothing left to correct.
    const withdrawal = await holdOpen(
      (tx) =>
        tx`select app_private.pepites_withdraw(${week14}::uuid, 'Erreur de données confirmée', ${STAFF}::uuid)`,
    );
    const racing = publish(db(b), correction);
    expect(await stillWaiting(racing)).toBe(true);
    await withdrawal.finish(true);
    await expect(racing).rejects.toThrow("PEPITES_EDITION_NOT_READY");
    expect((await editionState(week14)).status).toBe("withdrawn");
    expect((await editionState(correction)).status).toBe("scheduled");
    await db(c)`select app_private.pepites_unschedule(${correction}::uuid, ${STAFF}::uuid)`;
  });

  it("a re-point holding the week makes a publish wait, which then publishes the new revision", async () => {
    await db(c).unsafe(roundSql(5));
    const draft = await tick(db(b), "2026-10-05 11:15:00+00");
    week15 = draft.editionId as string;
    await scheduleFor(week15, "2026-10-05 19:00:00+00");
    await db(c).unsafe(correctionSql(5, 66));

    const held = await holdOpen((tx) => tick(tx, "2026-10-05 14:00:00+00"));
    const runs = (held.result as Record<string, unknown>).runs as Record<string, unknown>;
    expect(runs.run).toBe("scored");
    expect(runs.repointed).toEqual([
      expect.objectContaining({ editionId: week15, status: "scheduled" }),
    ]);

    const racing = publish(db(b), week15);
    expect(await stillWaiting(racing)).toBe(true);
    await held.finish(true);
    expect(await racing).toMatchObject({ status: "published", alreadyPublished: false });
    expect((await editionState(week15)).run_id).toBe(runs.runId as string);

    const moves = await db(c)`
      select coalesce(from_status, '-') || '>' || to_status || '/' || actor_kind as move
      from app_private.pepites_edition_moves where edition_id = ${week15}::uuid order by id`;
    expect(moves.map((row: { move: string }) => row.move)).toEqual([
      "->draft/system",
      "draft>scheduled/staff",
      "scheduled>draft/system",
      "draft>draft/system",
      "draft>scheduled/system",
      "scheduled>published/staff",
    ]);
  });

  it("a publish holding the week makes the tick's re-point wait; the tick then leaves it and keeps its run", async () => {
    await db(c).unsafe(roundSql(6));
    const draft = await tick(db(b), "2026-10-12 11:15:00+00");
    const week16 = draft.editionId as string;
    await scheduleFor(week16, "2026-10-12 19:00:00+00");
    const before = await editionState(week16);
    await db(c).unsafe(correctionSql(6, 66));

    const held = await holdOpen((tx) => publish(tx, week16));
    const racing = tick(db(b), "2026-10-12 14:00:00+00");
    expect(await stillWaiting(racing)).toBe(true);
    await held.finish(true);

    const result = await racing;
    expect(result.outcome).toBe("ok");
    const runs = result.runs as Record<string, unknown>;
    expect(runs.run).toBe("scored");
    expect(runs.repointed).toEqual([
      { editionId: week16, repointed: false, reason: "no_longer_open" },
    ]);
    const after = await editionState(week16);
    expect(after).toEqual({ status: "published", run_id: before.run_id });
    const [run] = await db(c)`
      select status from app.pepites_runs where id = ${runs.runId as string}::uuid`;
    expect(run.status).toBe("succeeded");
  });

  it("two drafts for one week share no row: the week lock alone makes the second wait and refuse", async () => {
    const [latest] = await db(c)`
      select app_private.pepites_latest_run(${SEASON}::uuid, null) as id`;
    const create = (connection: Bun.SQL) =>
      connection`select app_private.pepites_create_draft(${latest.id as string}::uuid, '2026-10-19', null) as id`;

    const held = await holdOpen((tx) => create(tx));
    const racing = create(db(b));
    expect(await stillWaiting(racing)).toBe(true);
    expect(await waitingOnLock("pepites_create_draft")).toBe(1);
    await held.finish(true);
    // Without the week lock the second insert would still be stopped, by the
    // one-open-edition index, but as a bare unique violation.
    await expect(racing).rejects.toThrow("PEPITES_WEEK_TAKEN");
  });
});
