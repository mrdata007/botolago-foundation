// The Pépites weekly email, end to end against a real local database
// (docs/engineering/PEPITES_ARCHITECTURE.md §5.4).
//
// A published edition's event is fanned out by the real pipeline, claimed by
// the real api.service_claim_email_deliveries, rendered by the real renderer,
// sent by the real dispatcher to a fake Resend that keeps Resend's documented
// idempotency (a key is remembered for 24 hours: the same key and body inside
// them returns the first result without sending), and recorded by the real
// api.service_record_notification_delivery_attempt. Nothing leaves the
// machine.
//
// Scenarios:
//   - French and Arabic readers each get one email, in their language;
//   - the provider accepts one but the answer is lost; the retry sends the
//     same key and body, and the provider returns the first result: still one
//     email;
//   - an unsure send whose first attempt is 24 hours old is closed as
//     possibly_sent and never handed to the dispatcher again.
//
// Opt-in, like pepites-editions-concurrency.test.ts: it writes rows that
// cannot be deleted (editions, runs), under fresh random ids, and switches
// the email pipeline to 'test' mode for its own three readers, restoring the
// settings afterwards. It runs only when PEPITES_E2E_DB_URL names a
// disposable database:
//
//   PEPITES_E2E_DB_URL=postgres://postgres:postgres@127.0.0.1:55322/postgres \
//     bun test scripts/backend/pepites-weekly-email-e2e.test.ts

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  emailDispatchConfiguration,
  runEmailDispatch,
  type EmailRpcClient,
} from "../../supabase/functions/_shared/notification-email-dispatch";
import {
  renderNotificationEmail,
  unsubscribeUrl,
} from "../../supabase/functions/_shared/notification-email-render";

const DB_URL = process.env.PEPITES_E2E_DB_URL || undefined;
const CONNECT_TIMEOUT_MS = 3_000;

if (!DB_URL) {
  console.info(
    "[pepites-weekly-email-e2e] Skipped: it writes append-only rows, so it runs only when " +
      "PEPITES_E2E_DB_URL names a disposable database.",
  );
}

const BASE = crypto.randomUUID().replaceAll("-", "").slice(0, 7);
const uid = (kind: number, n: number) =>
  `${BASE}${kind}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COMPETITION = uid(0, 1);
const SEASON = uid(1, 1);
const TEAM = uid(2, 1);
const RUN = uid(4, 1);
const STAFF = uid(9, 1);
const READERS = [
  { id: uid(6, 1), email: `pepites-e2e-${BASE}-fr@example.test`, language: "fr" },
  { id: uid(6, 2), email: `pepites-e2e-${BASE}-ar@example.test`, language: "ar" },
  { id: uid(6, 3), email: `pepites-e2e-${BASE}-fr2@example.test`, language: "fr" },
] as const;

let sql: Bun.SQL | null = null;
let savedEmailSettings: Record<string, unknown> | null = null;
let savedPepitesSettings: Record<string, unknown> | null = null;

function db(): Bun.SQL {
  if (!sql) throw new Error("not connected");
  return sql;
}

function json(value: unknown): Record<string, unknown> {
  return (typeof value === "string" ? JSON.parse(value) : value) as Record<string, unknown>;
}

/** The dispatcher's RPC client, over a direct connection with service claims. */
function serviceClient(connection: Bun.SQL): EmailRpcClient {
  return {
    schema() {
      return {
        async rpc(name: string, args: Record<string, unknown> = {}) {
          if (!/^[a-z_]+$/.test(name)) throw new Error("bad rpc name");
          const keys = Object.keys(args);
          for (const key of keys) if (!/^p_[a-z_0-9]+$/.test(key)) throw new Error("bad arg");
          try {
            const rows = await connection.begin(async (tx) => {
              await tx`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
              return tx.unsafe(
                `select api.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(", ")}) as result`,
                keys.map((key) => args[key]),
              );
            });
            return { data: rows[0]?.result ?? null, error: null };
          } catch (error) {
            return { data: null, error: { message: (error as Error).message } };
          }
        },
      };
    },
  };
}

/** Resend, as far as idempotency goes; `lose` drops the answer of an accepted email. */
function fakeResend() {
  const sent: Array<{ key: string; to: string; subject: string; text: string }> = [];
  const seen = new Map<string, { at: number; body: string; id: string }>();
  const lose = new Set<string>();
  let requests = 0;
  const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
    requests += 1;
    const key = new Headers(init?.headers).get("idempotency-key") ?? "";
    const body = String(init?.body);
    const earlier = seen.get(key);
    if (earlier && Date.now() - earlier.at < 24 * 3600 * 1000) {
      if (earlier.body !== body) {
        return new Response('{"name":"invalid_idempotent_request"}', { status: 409 });
      }
      return Response.json({ id: earlier.id });
    }
    const parsed = JSON.parse(body) as { to: string[]; subject: string; text: string };
    const id = `fake-${sent.length + 1}`;
    sent.push({ key, to: parsed.to[0]!, subject: parsed.subject, text: parsed.text });
    seen.set(key, { at: Date.now(), body, id });
    if (lose.has(parsed.to[0]!)) {
      lose.delete(parsed.to[0]!);
      throw new TypeError("connection reset after the provider accepted");
    }
    return Response.json({ id });
  };
  return { fetchImpl, sent, lose, requests: () => requests };
}

const config = () =>
  emailDispatchConfiguration({
    RESEND_API_KEY: "re_test_0123456789abcdef",
    SUPABASE_URL: "https://project.supabase.co",
  });

async function dispatch(resend: ReturnType<typeof fakeResend>) {
  return runEmailDispatch(config(), {
    environment: {},
    client: serviceClient(db()),
    render: renderNotificationEmail,
    unsubscribeUrl,
    fetch: resend.fetchImpl,
    sleep: async () => {},
  });
}

async function fanout(): Promise<void> {
  await db()`
    select app_private.notification_email_fanout(statement_timestamp(), settings.mode,
      settings.test_user_ids, settings.activated_at, settings.max_emails_per_run)
    from app_private.notification_email_settings settings`;
}

async function publishWeek(on: string): Promise<string> {
  const [row] = await db()`
    select app_private.pepites_create_draft(${RUN}::uuid, ${on}::date, null) as id`;
  const id = row.id as string;
  await db()`select app_private.pepites_schedule(${id}::uuid, now(), ${STAFF}::uuid)`;
  await db()`select app_private.pepites_publish_edition(${id}::uuid, ${STAFF}::uuid)`;
  return id;
}

async function deliveries(editionId: string) {
  return db()`
    select auth_user.email, delivery.id, delivery.status::text as status, delivery.stable_error_code,
      (select count(*)::integer from app_private.notification_delivery_attempts attempt
        where attempt.delivery_id = delivery.id) as attempts,
      (select count(distinct attempt.body_sha256)::integer from app_private.notification_delivery_attempts attempt
        where attempt.delivery_id = delivery.id) as bodies
    from app.notifications notification
    join app.notification_deliveries delivery
      on delivery.notification_id = notification.id and delivery.channel = 'email'
    join auth.users auth_user on auth_user.id = notification.user_id
    where notification.notification_type = 'pepites_weekly'
      and notification.source_entity_id = ${editionId}::uuid
    order by auth_user.email` as Promise<
    Array<{
      email: string;
      id: string;
      status: string;
      stable_error_code: string | null;
      attempts: number;
      bodies: number;
    }>
  >;
}

const describeDb = DB_URL ? describe : describe.skip;

beforeAll(async () => {
  if (!DB_URL) return;
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
      `[pepites-weekly-email-e2e] PEPITES_E2E_DB_URL is set, but its database did not answer (${(error as Error).message}).`,
    );
  }
  sql = candidate;
  const [email] =
    await sql`select to_jsonb(s) as row from app_private.notification_email_settings s where id`;
  savedEmailSettings = json(email.row);
  const [pepites] =
    await sql`select to_jsonb(s) as row from app_private.pepites_settings s where id`;
  savedPepitesSettings = json(pepites.row);

  await sql.unsafe(`
    insert into app.competitions (id, slug, name, competition_type)
    values ('${COMPETITION}', 'pepites-email-e2e-${BASE}', 'Pépites Email E2E ${BASE}', 'league');
    insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status)
    values ('${SEASON}', '${COMPETITION}', '2026/2027', '2026-07-01', '2027-06-30', true, 'active');
    insert into app.teams (id, slug, name, short_name)
    values ('${TEAM}', 'pepites-email-e2e-${BASE}', 'Club E2E ${BASE}', 'CE');
    insert into app.team_translations (team_id, language, name, short_name)
    values ('${TEAM}', 'ar', 'نادي الاختبار', 'الاختبار');
    insert into app.players (id, slug, full_name, display_name, position)
    select ('${BASE}3-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'pepites-email-e2e-${BASE}-' || n, 'E2E Player ' || n, 'E2E Joueur ' || n, 'midfielder'
    from generate_series(1, 12) n;
    insert into app.pepites_runs (id, season_id, kind, as_of_round_number, methodology_version,
      revision, input_cutoff_at)
    values ('${RUN}', '${SEASON}', 'weekly', 5, 'v1', 1, now());
    insert into app.pepites_player_scores (run_id, player_id, team_id, position_group, age_years,
      apps, starts, minutes, goals, assists, saves, clean_sheets, rating_avg, rating_n, form_avg,
      eligible, per90, percentiles, components, flags, score_exact, score, rank, rank_in_position)
    select '${RUN}', ('${BASE}3-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '${TEAM}', 'MID',
      20, 5, 5, 450, 1, 1, null, null, 7.0, 5, 7.0, true, '{}', '{}', '{}', '{}',
      90 - n * 2, 90 - n * 2, n, n
    from generate_series(1, 12) n;
    update app.pepites_runs set status = 'succeeded', finished_at = now(), eligible_count = 12,
      ranked_count = 12, input_fingerprint = repeat('0', 64)
    where id = '${RUN}';
  `);
  for (const reader of READERS) {
    await sql`
      insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
        encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${reader.id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', ${reader.email}, now(), 'hash', '{}',
        jsonb_build_object('username', ${`pe2e_${BASE}_${reader.id.slice(-1)}`}::text,
          'preferred_language', ${reader.language}::text),
        now(), now())`;
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: reader.id, role: "authenticated", aal: "aal1" })}, true)`;
      await tx`select api.set_my_pepites_weekly_email(true)`;
    });
  }
  await sql`
    select app_private.notification_email_configure('test', 'http://kong:8000/functions/v1',
      ${`{${READERS.map((reader) => reader.id).join(",")}}`}::uuid[], null, null, 100, null, 10)`;
  await sql`select app_private.pepites_configure('public', false, ${COMPETITION}::uuid)`;
});

afterAll(async () => {
  if (sql && savedEmailSettings && savedPepitesSettings) {
    const e = savedEmailSettings;
    await sql`
      update app_private.notification_email_settings set
        mode = ${e.mode as string},
        test_user_ids = ${`{${(e.test_user_ids as string[]).join(",")}}`}::uuid[],
        functions_base_url = ${(e.functions_base_url as string | null) ?? null},
        max_emails_per_run = ${e.max_emails_per_run as number},
        daily_email_limit = ${e.daily_email_limit as number},
        monthly_email_limit = ${e.monthly_email_limit as number},
        daily_email_reserve = ${e.daily_email_reserve as number},
        activated_at = ${(e.activated_at as string | null) ?? null}::timestamptz
      where id`;
    const p = savedPepitesSettings;
    await sql`
      update app_private.pepites_settings set
        mode = ${p.mode as string},
        auto_publish = ${p.auto_publish as boolean},
        competition_id = ${(p.competition_id as string | null) ?? null}::uuid
      where id`;
  }
  await sql?.end();
});

describeDb("the Pépites weekly email, from publication to the provider", () => {
  const resend = fakeResend();
  let edition = "";

  it("sends each opted-in reader one email in their language, and records each body", async () => {
    edition = await publishWeek("2026-10-12");
    await fanout();
    resend.lose.add(READERS[1].email);

    const summary = await dispatch(resend);
    expect(summary).toMatchObject({ claimed: 3, sent: 2, retrying: 1, failed: 0 });

    const subjects = Object.fromEntries(resend.sent.map((mail) => [mail.to, mail.subject]));
    expect(subjects[READERS[0].email]).toBe("Pépites · Semaine 16 : le Top 10 des jeunes");
    expect(subjects[READERS[1].email]).toBe("Pépites · الأسبوع 16: توب 10 للشباب");
    const arabic = resend.sent.find((mail) => mail.to === READERS[1].email)!;
    expect(arabic.text).toContain("1. E2E Joueur 1 · نادي الاختبار · 88/100");
    expect(arabic.text).toContain("&topic=pepites_weekly");

    const rows = await deliveries(edition);
    expect(rows.map((row) => [row.email, row.status, row.attempts, row.bodies])).toEqual([
      [READERS[1].email, "retry_scheduled", 1, 1],
      [READERS[0].email, "sent", 1, 1],
      [READERS[2].email, "sent", 1, 1],
    ]);
  });

  it("retries the lost answer with the same key and body: the provider returns the first result, one email", async () => {
    const before = resend.sent.length;
    await db()`
      update app.notification_deliveries set next_retry_at = now() - interval '1 second'
      where id in (select id from app.notification_deliveries where status = 'retry_scheduled'
        and notification_id in (select id from app.notifications
          where source_entity_id = ${edition}::uuid and notification_type = 'pepites_weekly'))`;
    const summary = await dispatch(resend);
    expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(resend.sent.length).toBe(before);
    const arabic = (await deliveries(edition)).find((row) => row.email === READERS[1].email)!;
    expect([arabic.status, arabic.attempts, arabic.bodies]).toEqual(["sent", 2, 1]);
  });

  it("closes an unsure send as possibly_sent once its first attempt is a day old, and never hands it out again", async () => {
    const next = await publishWeek("2026-10-19");
    await fanout();
    for (const reader of READERS) resend.lose.add(reader.email);
    expect(await dispatch(resend)).toMatchObject({ claimed: 3, sent: 0, retrying: 3 });
    const sentBefore = resend.sent.length;
    const requestsBefore = resend.requests();

    await db()`
      update app.notification_deliveries set next_retry_at = now() - interval '1 second',
        first_claimed_at = now() - interval '24 hours'
      where notification_id in (select id from app.notifications
        where source_entity_id = ${next}::uuid and notification_type = 'pepites_weekly')`;
    expect(await dispatch(resend)).toMatchObject({ claimed: 0 });
    expect(resend.requests()).toBe(requestsBefore);
    expect(resend.sent.length).toBe(sentBefore);
    expect((await deliveries(next)).map((row) => `${row.status}:${row.stable_error_code}`)).toEqual(
      ["cancelled:possibly_sent", "cancelled:possibly_sent", "cancelled:possibly_sent"],
    );
    const [report] = await db()`select app_private.pepites_email_report(${next}::uuid) as report`;
    expect(json(report.report)).toMatchObject({ total: 3, sent: 0, possiblySent: 3 });
  });
});
