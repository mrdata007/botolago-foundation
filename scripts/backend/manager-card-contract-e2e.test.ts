// BG-0158: the Manager Card contract, end to end.
//
// What this proves that the pgTAP files cannot: the JSON the real api functions return, read
// back the way PostgREST would hand it to the browser, is accepted by the real zod schemas of the
// front end (src/backend/manager-card/contracts.ts), key for key. pgTAP checks key sets against a
// list somebody typed; this file checks them against the schemas the Gradins section runs.
//
// It seeds the fixture of scripts/backend/manager-card-contract-seed.sql (the fixture of
// supabase/tests/database/manager_card_api.test.sql, plus rules and the read switch), calls each
// function as `authenticated` or `anon` with the JWT claims PostgREST sets, parses the answer with
// the schema, and checks the parsed value equals the raw one. Zod objects strip unknown keys, so
// that second check is what fails when the server adds or renames a key.
//
// Every test runs inside ONE transaction that is always rolled back: nothing is left behind, and
// the database is written to only inside it. It is opt-in anyway, like the other wire-format tests:
// it runs only when MANAGER_CARD_E2E_DB_URL names a database (a freshly reset local stack), is
// skipped otherwise and connects to nothing, and FAILS (does not skip) when set but unreachable.
//
//   MANAGER_CARD_E2E_DB_URL=postgres://postgres:postgres@127.0.0.1:55322/postgres \
//     bun test scripts/backend/manager-card-contract-e2e.test.ts
//
// MANAGER_CARD_E2E_STRICT_TIMING=1 also asserts the latency budgets (get_my_manager_card 40 ms,
// a 100-id get_manager_cards 80 ms); the numbers are always printed.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ZodType } from "zod";

import {
  ackResponseSchema,
  cardsResponseSchema,
  historyResponseSchema,
  managerCardStatusSchema,
  myCardResponseSchema,
  RATING_STATES,
  type MomentKind,
} from "@/backend/manager-card/contracts";

const DB_URL = process.env.MANAGER_CARD_E2E_DB_URL || undefined;
const STRICT_TIMING = process.env.MANAGER_CARD_E2E_STRICT_TIMING === "1";
const CONNECT_TIMEOUT_MS = 3_000;
const TEST_TIMEOUT_MS = 60_000;
const SEED = readFileSync(join(import.meta.dir, "manager-card-contract-seed.sql"), "utf8");
const MOMENT_KINDS: readonly MomentKind[] = [
  "card_created",
  "first_rating",
  "provisional_cleared",
  "tier_changed",
  "founder_granted",
  "season_closed",
  "season_started",
];

let sql: Bun.SQL | null = null;

if (!DB_URL) {
  console.info(
    "[manager-card-contract-e2e] Skipped: it seeds a database (inside a transaction it rolls " +
      "back), so it runs only when MANAGER_CARD_E2E_DB_URL names one.",
  );
}

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
      "[manager-card-contract-e2e] MANAGER_CARD_E2E_DB_URL is set, but its database did not " +
        `answer within ${CONNECT_TIMEOUT_MS}ms (${(error as Error).message}). Start it with ` +
        "`supabase db start`, or unset the variable to skip this file.",
    );
  }
  sql = candidate;
});

afterAll(async () => {
  if (sql) await sql.end();
});

// ---------------------------------------------------------------------------
// Fixture ids (the same as the pgTAP file: pg_temp.id(n))
// ---------------------------------------------------------------------------
const id = (n: number) => `bc1e0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USERS = ["M", "N", "P", "Q", "R", "S", "V", "W"] as const;
type Person = (typeof USERS)[number];
const user = (p: Person) => id(300 + USERS.indexOf(p) + 1);
const team = (p: Exclude<Person, "W">) => id(400 + USERS.indexOf(p) + 1);
const FS1 = id(5);
const FS0 = id(9);

// ---------------------------------------------------------------------------
// One rolled-back transaction, and calls made the way PostgREST makes them
// ---------------------------------------------------------------------------
class Rollback extends Error {}

type Tx = Bun.SQL;
type Who =
  | { role: "anon" }
  | { role: "service_role" }
  | { role: "authenticated"; person?: Person; aal?: "aal1" | "aal2" };

async function inRolledBackTransaction(body: (tx: Tx) => Promise<void>): Promise<void> {
  if (!sql) throw new Error("no database");
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(SEED);
      await body(tx);
      throw new Rollback("rolled back on purpose");
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

async function actAs(tx: Tx, who: Who): Promise<void> {
  const claims =
    who.role === "authenticated" && who.person
      ? { sub: user(who.person), role: who.role, aal: who.aal ?? "aal1" }
      : { role: who.role };
  await tx.unsafe(`set local role ${who.role}`);
  await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
}

async function actAsOwner(tx: Tx): Promise<void> {
  await tx.unsafe("reset role");
  await tx.unsafe("select set_config('request.jwt.claims', '', true)");
}

/** `select <expression>::text`, as `who`, parsed from its text exactly as the browser gets it. */
async function call(tx: Tx, who: Who, expression: string): Promise<unknown> {
  await actAs(tx, who);
  const rows = (await tx.unsafe(`select (${expression})::text as j`)) as { j: string }[];
  await actAsOwner(tx);
  return JSON.parse(rows[0].j);
}

const authed = (person: Person, aal: "aal1" | "aal2" = "aal1"): Who => ({
  role: "authenticated",
  person,
  aal,
});
const uuidArray = (ids: readonly string[]) =>
  `array[${ids.map((x) => `'${x}'`).join(", ")}]::uuid[]`;
const textArray = (keys: readonly string[]) =>
  `array[${keys.map((k) => `'${k}'`).join(", ")}]::text[]`;

async function setReads(tx: Tx, on: boolean): Promise<void> {
  await tx.unsafe(`select app_private.manager_card_configure(null, ${on})`);
}

/** Parses with the front end's schema, and fails if the schema had to drop or invent a key. */
function strict<T>(schema: ZodType<T>, raw: unknown): T {
  const parsed = schema.parse(raw);
  expect(parsed).toEqual(raw as T);
  return parsed;
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------
describe.skipIf(!DB_URL)("Manager Card contract: real RPC JSON parsed by contracts.ts", () => {
  it(
    "the status parses, on and off, for anon",
    async () => {
      await inRolledBackTransaction(async (tx) => {
        const on = strict(
          managerCardStatusSchema,
          await call(tx, { role: "anon" }, "api.manager_card_status()"),
        );
        expect(on).toEqual({ enabled: true, minRated: 3, minConfirmed: 5 });
        await setReads(tx, false);
        const off = strict(
          managerCardStatusSchema,
          await call(tx, { role: "anon" }, "api.manager_card_status()"),
        );
        expect(off).toEqual({ enabled: false, minRated: null, minConfirmed: null });
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "my card parses for every state (forming, insufficient, provisional, rated), no team, and off",
    async () => {
      await inRolledBackTransaction(async (tx) => {
        const states = new Set<string>();
        const kinds = new Set<string>();
        for (const person of ["M", "N", "P", "Q", "S"] as const) {
          const parsed = strict(
            myCardResponseSchema,
            await call(tx, authed(person), "api.get_my_manager_card()"),
          );
          expect(parsed).toMatchObject({ available: true });
          if (!("card" in parsed) || parsed.card === null) throw new Error(`${person} has no card`);
          states.add(parsed.card.ratingState);
          for (const moment of parsed.card.moments) kinds.add(moment.kind);
        }
        for (const person of ["W", "R"] as const) {
          const parsed = strict(
            myCardResponseSchema,
            await call(tx, authed(person), "api.get_my_manager_card()"),
          );
          expect(parsed).toEqual({ available: true, card: null });
        }
        // The V account has a verified factor: at aal2 it reads like anybody else.
        strict(
          myCardResponseSchema,
          await call(tx, authed("V", "aal2"), "api.get_my_manager_card()"),
        );

        expect([...states].sort()).toEqual([...RATING_STATES].sort());
        expect([...kinds].sort()).toEqual([...MOMENT_KINDS].sort());

        await setReads(tx, false);
        const off = strict(
          myCardResponseSchema,
          await call(tx, authed("M"), "api.get_my_manager_card()"),
        );
        expect(off).toEqual({ available: false });
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "a batch of every team parses, an empty one parses, and off parses",
    async () => {
      await inRolledBackTransaction(async (tx) => {
        const everyone = (["M", "N", "P", "Q", "R", "S", "V"] as const).map(team);
        const batch = strict(
          cardsResponseSchema,
          await call(tx, authed("W"), `api.get_manager_cards(${uuidArray(everyone)})`),
        );
        if (!("cards" in batch)) throw new Error("the batch was off");
        // R is deleted-pending and left out.
        expect(batch.cards.map((c) => c.teamId)).toEqual(everyone.filter((t) => t !== team("R")));
        const empty = strict(
          cardsResponseSchema,
          await call(tx, authed("W"), "api.get_manager_cards(array[]::uuid[])"),
        );
        expect(empty).toEqual({ available: true, cards: [] });

        await setReads(tx, false);
        const off = strict(
          cardsResponseSchema,
          await call(tx, authed("W"), `api.get_manager_cards(${uuidArray(everyone)})`),
        );
        expect(off).toEqual({ available: false });
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "history parses for page one, page two, another season, and off",
    async () => {
      await inRolledBackTransaction(async (tx) => {
        const first = strict(
          historyResponseSchema,
          await call(tx, authed("M"), "api.get_my_manager_card_history(null, null, 2)"),
        );
        expect(first).toMatchObject({ available: true, nextBeforeSeq: 2 });
        const second = strict(
          historyResponseSchema,
          await call(tx, authed("M"), "api.get_my_manager_card_history(null, 2, 2)"),
        );
        expect(second).toMatchObject({ available: true, nextBeforeSeq: null });
        const earlier = strict(
          historyResponseSchema,
          await call(tx, authed("M"), `api.get_my_manager_card_history('${FS0}', null, 20)`),
        );
        expect(earlier).toMatchObject({ available: true });
        if (!("items" in earlier)) throw new Error("history was off");
        expect(earlier.items.map((i) => i.seasonLabel)).toEqual(["2088/89"]);

        await setReads(tx, false);
        const off = strict(
          historyResponseSchema,
          await call(tx, authed("M"), "api.get_my_manager_card_history(null, null, 20)"),
        );
        expect(off).toEqual({ available: false });
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "an acknowledgement parses, mixed and off",
    async () => {
      await inRolledBackTransaction(async (tx) => {
        const keys = [`first_rating:${FS1}`, "tier_changed:legend", "card_created"];
        const mixed = strict(
          ackResponseSchema,
          await call(tx, authed("M"), `api.ack_manager_card_moments(${textArray(keys)})`),
        );
        expect(mixed).toEqual({
          acknowledged: [`first_rating:${FS1}`, "card_created"],
          ignored: ["tier_changed:legend"],
        });
        await setReads(tx, false);
        const off = strict(
          ackResponseSchema,
          await call(tx, authed("M"), `api.ack_manager_card_moments(${textArray(keys)})`),
        );
        expect(off).toEqual({ acknowledged: [], ignored: keys });
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "latency: get_my_manager_card and a 100-id get_manager_cards with 100 more teams",
    async () => {
      await inRolledBackTransaction(async (tx) => {
        // 100 more managers: a team, a card, a season row and three history rows each.
        const n = "('bc1e0000-0000-4000-8000-' || lpad((%d + i)::text, 12, '0'))::uuid";
        const at = (base: number) => n.replace("%d", String(base));
        await tx.unsafe(`
          insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
            encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
          select ${at(10000)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mca-load-' || i || '@example.test', statement_timestamp(), 'hash', '{}',
            jsonb_build_object('username', 'load_' || i, 'display_name', 'Load ' || i),
            statement_timestamp(), statement_timestamp()
          from generate_series(1, 100) i;
          insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
            free_transfers, status, created_at)
          select ${at(20000)}, ${at(10000)}, '${FS1}', 'Load team ' || i, 0, 100, 1, 'active',
            timestamptz '2089-08-01 00:00:00+00'
          from generate_series(1, 100) i;
          insert into app.manager_cards (user_id, serial, created_at)
          select ${at(10000)}, (100000 + i)::text, timestamptz '2089-08-02 00:00:00+00'
          from generate_series(1, 100) i;
          insert into app.manager_card_seasons (user_id, fantasy_season_id, fantasy_team_id, ovr, tier,
            cap, sel, trf, con, gameweeks_counted, provisional, rules_version, through_gameweek_id)
          select ${at(10000)}, '${FS1}', ${at(20000)}, 60 + i % 30, 'pro', 60, 61, 62, 63, 3, true, 1,
            '${id(23)}'
          from generate_series(1, 100) i;
          insert into app.manager_card_gameweeks (user_id, fantasy_season_id, gameweek_id, ovr, tier,
            cap, sel, trf, con, gameweeks_counted, provisional, rules_version)
          select ${at(10000)}, '${FS1}', ('bc1e0000-0000-4000-8000-' || lpad((20 + g)::text, 12, '0'))::uuid,
            case when g = 3 then 60 + i % 30 end, case when g = 3 then 'pro' end,
            case when g = 3 then 60 end, case when g = 3 then 61 end,
            case when g = 3 then 62 end, case when g = 3 then 63 end, g, true, 1
          from generate_series(1, 100) i cross join generate_series(1, 3) g
        `);
        await tx.unsafe("analyze");

        const ids = Array.from({ length: 100 }, (_, i) => id(20001 + i));
        const explain = async (who: Who, expression: string): Promise<number> => {
          await actAs(tx, who);
          const rows = (await tx.unsafe(
            `explain (analyze, format json) select (${expression})`,
          )) as Record<string, unknown>[];
          await actAsOwner(tx);
          const cell = rows[0]["QUERY PLAN"];
          const plan = (typeof cell === "string" ? JSON.parse(cell) : cell) as {
            "Execution Time": number;
          }[];
          return plan[0]["Execution Time"];
        };
        // A first call warms the plans; the second is measured.
        await explain(authed("M"), "api.get_my_manager_card()");
        const mine = await explain(authed("M"), "api.get_my_manager_card()");
        await explain(authed("W"), `api.get_manager_cards(${uuidArray(ids)})`);
        const batch = await explain(authed("W"), `api.get_manager_cards(${uuidArray(ids)})`);
        console.info(
          `[manager-card-contract-e2e] latency: get_my_manager_card ${mine.toFixed(1)} ms ` +
            `(budget 40), get_manager_cards of 100 ids ${batch.toFixed(1)} ms (budget 80)` +
            `${STRICT_TIMING ? "" : "; budgets not asserted without MANAGER_CARD_E2E_STRICT_TIMING=1"}`,
        );
        const parsed = strict(
          cardsResponseSchema,
          await call(tx, authed("W"), `api.get_manager_cards(${uuidArray(ids)})`),
        );
        if (!("cards" in parsed)) throw new Error("the batch was off");
        expect(parsed.cards).toHaveLength(100);
        if (STRICT_TIMING) {
          expect(mine).toBeLessThanOrEqual(40);
          expect(batch).toBeLessThanOrEqual(80);
        }
      });
    },
    TEST_TIMEOUT_MS,
  );
});
