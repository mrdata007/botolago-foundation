// The push dispatcher, end to end between its two halves: the REAL dispatch
// loop (`runPushDispatch`) talking to the REAL database functions
// (api.service_claim_push_deliveries, the recorder, the release and the device
// invalidation), with fake providers standing in for Google and Apple.
//
// The Edge Function tests fake the database and the pgTAP suite hand-writes
// the rows; neither shows that what the SQL hands out is what the TypeScript
// accepts, or that what the TypeScript records is what the SQL expects. This
// does.
//
// Opt-in, like the other end-to-end files: it runs only when
// PUSH_DISPATCH_E2E_DB_URL names a database explicitly,
//
//   PUSH_DISPATCH_E2E_DB_URL=postgres://postgres:postgres@127.0.0.1:55322/postgres \
//     bun test scripts/backend/push-dispatch-e2e.test.ts
//
// and otherwise skips without connecting to anything. Set but unreachable, it
// fails rather than skipping. Everything runs in one transaction that is rolled
// back, so it leaves nothing behind -- but a rolled-back write still takes
// locks, and still counts as a write to that database (AGENTS.md).

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  runPushDispatch,
  type PushRpcClient,
} from "../../supabase/functions/_shared/notification-push-dispatch";
import {
  outcome,
  type ClaimedPushDelivery,
  type PushProvider,
  type PushProviderKey,
} from "../../supabase/functions/_shared/notification-push-types";

const DB_URL = process.env.PUSH_DISPATCH_E2E_DB_URL || undefined;
const CONNECT_TIMEOUT_MS = 3_000;

let sql: Bun.SQL | null = null;

if (!DB_URL) {
  console.info(
    "[push-dispatch-e2e] Skipped: it writes to a database, so it runs only when " +
      "PUSH_DISPATCH_E2E_DB_URL names one (a local stack started with `supabase db start`).",
  );
}

beforeAll(async () => {
  if (!DB_URL) return;
  const candidate = new Bun.SQL({ url: DB_URL });
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
      "[push-dispatch-e2e] PUSH_DISPATCH_E2E_DB_URL is set, but its database did not answer " +
        `within ${CONNECT_TIMEOUT_MS}ms (${(error as Error).message}). Start it with ` +
        "`supabase db start`, or unset the variable to skip this file.",
    );
  }
  sql = candidate;
});

afterAll(async () => {
  await sql?.end();
});

function literal(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return `array[${value.map(literal).join(", ")}]::uuid[]`;
  }
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

type Tx = Parameters<Parameters<Bun.SQL["begin"]>[0]>[0];

/**
 * The dispatcher's `client.schema("api").rpc(...)`, over one transaction, as
 * the service role the Edge Function runs as. Each call runs alone inside a
 * savepoint, so an expected refusal does not abort the rest.
 */
function rpcClient(tx: Tx): PushRpcClient {
  let queue: Promise<unknown> = Promise.resolve();
  const call = async (name: string, args: Record<string, unknown>) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unexpected rpc name ${name}`);
    const named = Object.entries(args)
      .map(([key, value]) => `${key} => ${literal(value)}`)
      .join(", ");
    await tx.unsafe("savepoint push_rpc");
    try {
      await tx.unsafe("set local role service_role");
      await tx.unsafe(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      const rows = (await tx.unsafe(`select api.${name}(${named}) as result`)) as Array<{
        result: unknown;
      }>;
      await tx.unsafe("reset role");
      await tx.unsafe("release savepoint push_rpc");
      return { data: rows[0]?.result ?? null, error: null };
    } catch (error) {
      await tx.unsafe("rollback to savepoint push_rpc");
      const failure = error as { message?: string; errno?: string };
      return { data: null, error: { message: failure.message ?? "failed", code: failure.errno } };
    }
  };
  return {
    schema: () => ({
      rpc: (name: string, args: Record<string, unknown> = {}) => {
        const next = queue.then(() => call(name, args));
        queue = next.catch(() => undefined);
        return next;
      },
    }),
  } as PushRpcClient;
}

const IDS = {
  user: "e7f00000-0000-4000-8000-000000000001",
  devices: {
    android: "e7f10000-0000-4000-8000-000000000001",
    ios: "e7f10000-0000-4000-8000-000000000002",
    dead: "e7f10000-0000-4000-8000-000000000003",
  },
  event: "e7f20000-0000-4000-8000-000000000001",
  notification: "e7f30000-0000-4000-8000-000000000001",
  deliveries: {
    android: "e7f40000-0000-4000-8000-000000000001",
    ios: "e7f40000-0000-4000-8000-000000000002",
    dead: "e7f40000-0000-4000-8000-000000000003",
  },
} as const;

/** One reader with three phones and one goal alert for each. */
async function seed(tx: Tx): Promise<void> {
  await tx.unsafe(`
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('${IDS.user}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'push-e2e@example.test', statement_timestamp(), 'hash', '{}',
      '{"username":"push_e2e","preferred_language":"fr"}', statement_timestamp(), statement_timestamp());
    update app.user_preferences set push_notifications_enabled = true where user_id = '${IDS.user}';
  `);
  const devices: Array<[string, string, string, string]> = [
    [IDS.devices.android, "android", "fcm", "android-token-0000000001-abcdef"],
    [IDS.devices.ios, "ios", "apns", "ab".repeat(32)],
    [IDS.devices.dead, "android", "fcm", "dead-token-0000000000003-abcdef"],
  ];
  for (const [id, platform, provider, token] of devices) {
    await tx.unsafe(`
      insert into app.device_registrations (id, user_id, device_id, platform, push_provider, locale)
      values ('${id}', '${IDS.user}', 'device-${id.slice(-1)}-e2e', '${platform}', '${provider}', 'fr');
      insert into app_private.push_destinations (device_registration_id, destination_digest, destination_value)
      values ('${id}', extensions.digest('${token}', 'sha256'), '${token}');
    `);
  }
  await tx.unsafe(`
    insert into app_private.notification_events (id, event_type, source_domain, target_user_id,
      occurred_at, schema_version, deduplication_key, correlation_id)
    values ('${IDS.event}', 'goal', 'football', '${IDS.user}', statement_timestamp(), 1,
      'push-dispatch-e2e-event', 'e7f50000-0000-4000-8000-000000000001');
    insert into app.notifications (id, user_id, event_id, template_id, notification_type, category,
      language, title, body, source_domain)
    select '${IDS.notification}', '${IDS.user}', '${IDS.event}', template.id, 'goal', template.category,
      'fr', 'But pour le Raja !', 'Raja 1–0 Wydad (34′)', 'football'
    from app.notification_templates template
    where template.notification_type = 'goal' and template.language = 'fr'
      and template.channel = 'in_app' and template.active
    limit 1;
    insert into app.notification_deliveries (id, notification_id, channel, device_registration_id, provider_key)
    values
      ('${IDS.deliveries.android}', '${IDS.notification}', 'push', '${IDS.devices.android}', 'fcm'),
      ('${IDS.deliveries.ios}', '${IDS.notification}', 'push', '${IDS.devices.ios}', 'apns'),
      ('${IDS.deliveries.dead}', '${IDS.notification}', 'push', '${IDS.devices.dead}', 'fcm');
    select app_private.notification_push_configure('live');
  `);
}

class Rollback extends Error {}

/** Runs `body` inside a transaction that is always rolled back. */
async function rolledBack(body: (tx: Tx) => Promise<void>): Promise<void> {
  if (!sql) return;
  try {
    await sql.begin(async (tx) => {
      await body(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

function fakeProvider(
  key: PushProviderKey,
  answer: (delivery: ClaimedPushDelivery) => ReturnType<typeof outcome>,
) {
  const seen: ClaimedPushDelivery[] = [];
  const provider: PushProvider = {
    key,
    async send(delivery) {
      seen.push(delivery);
      return answer(delivery);
    },
  };
  return { provider, seen };
}

const config = { batchSize: 50, budgetMs: 60_000, concurrency: 4 };

describe.skipIf(!DB_URL)("push dispatch against the real database functions", () => {
  it("sends what the database claims, and records what came of it", async () => {
    await rolledBack(async (tx) => {
      await seed(tx);
      const fcm = fakeProvider("fcm", (delivery) =>
        delivery.deviceRegistrationId === IDS.devices.dead
          ? outcome("permanent_failure", {
              stableErrorCode: "fcm_unregistered",
              invalidDestination: true,
            })
          : outcome("sent", { providerMessageId: "projects/p/messages/1" }),
      );
      const apns = fakeProvider("apns", () => outcome("sent", { providerMessageId: "apple-1" }));

      const summary = await runPushDispatch(config, {
        environment: {},
        client: rpcClient(tx),
        providers: { fcm: fcm.provider, apns: apns.provider },
      });

      // What the SQL handed out is what the sender accepts, field for field.
      expect(summary).toMatchObject({
        claimed: 3,
        sent: 2,
        failed: 1,
        retrying: 0,
        devicesTurnedOff: 1,
        handedBack: 0,
      });
      const android = fcm.seen.find((delivery) => delivery.id === IDS.deliveries.android)!;
      expect(android).toMatchObject({
        providerKey: "fcm",
        platform: "android",
        type: "goal",
        language: "fr",
        title: "But pour le Raja !",
        body: "Raja 1–0 Wydad (34′)",
        deepLink: { target: "none", entityId: null },
        destination: "android-token-0000000001-abcdef",
        attemptNumber: 1,
      });
      expect(android.expiresInSeconds).toBeGreaterThan(0);
      expect(android.expiresInSeconds).toBeLessThanOrEqual(600);
      expect(apns.seen).toHaveLength(1);
      expect(apns.seen[0]).toMatchObject({ platform: "ios", destination: "ab".repeat(32) });

      // What the sender recorded is what the database expects.
      const rows = (await tx.unsafe(`
        select id::text, status::text, attempt_count, provider_message_id, stable_error_code
        from app.notification_deliveries where notification_id = '${IDS.notification}' and channel = 'push'
        order by id
      `)) as Array<Record<string, unknown>>;
      expect(rows).toEqual([
        {
          id: IDS.deliveries.android,
          status: "sent",
          attempt_count: 1,
          provider_message_id: "projects/p/messages/1",
          stable_error_code: null,
        },
        {
          id: IDS.deliveries.ios,
          status: "sent",
          attempt_count: 1,
          provider_message_id: "apple-1",
          stable_error_code: null,
        },
        {
          id: IDS.deliveries.dead,
          status: "dead_lettered",
          attempt_count: 1,
          provider_message_id: null,
          stable_error_code: "fcm_unregistered",
        },
      ]);
      const device = (await tx.unsafe(
        `select enabled, invalidated_at is not null as invalidated from app.device_registrations where id = '${IDS.devices.dead}'`,
      )) as Array<Record<string, unknown>>;
      expect(device).toEqual([{ enabled: false, invalidated: true }]);

      // A second pass finds nothing left to send.
      const again = await runPushDispatch(config, {
        environment: {},
        client: rpcClient(tx),
        providers: { fcm: fcm.provider, apns: apns.provider },
      });
      expect(again).toMatchObject({ claimed: 0, sent: 0 });
    });
  });

  it("hands pushes back untouched when a provider has no credentials", async () => {
    await rolledBack(async (tx) => {
      await seed(tx);
      const apns = fakeProvider("apns", () => outcome("sent", { providerMessageId: "apple-1" }));
      const summary = await runPushDispatch(config, {
        environment: {},
        client: rpcClient(tx),
        providers: { apns: apns.provider },
      });
      expect(summary).toMatchObject({ sent: 1, handedBack: 2, unconfigured: ["fcm"] });
      const rows = (await tx.unsafe(`
        select id::text, status::text, attempt_count,
          next_retry_at > statement_timestamp() + interval '9 minutes' as waits_ten_minutes
        from app.notification_deliveries where notification_id = '${IDS.notification}' and channel = 'push'
        order by id
      `)) as Array<Record<string, unknown>>;
      expect(rows).toEqual([
        {
          id: IDS.deliveries.android,
          status: "retry_scheduled",
          attempt_count: 0,
          waits_ten_minutes: true,
        },
        { id: IDS.deliveries.ios, status: "sent", attempt_count: 1, waits_ten_minutes: null },
        {
          id: IDS.deliveries.dead,
          status: "retry_scheduled",
          attempt_count: 0,
          waits_ten_minutes: true,
        },
      ]);
    });
  });

  it("does nothing while push is switched off", async () => {
    await rolledBack(async (tx) => {
      await seed(tx);
      await tx.unsafe("select app_private.notification_push_configure('off')");
      const fcm = fakeProvider("fcm", () => outcome("sent"));
      const summary = await runPushDispatch(config, {
        environment: {},
        client: rpcClient(tx),
        providers: { fcm: fcm.provider },
      });
      expect(summary).toMatchObject({ claimed: 0, sent: 0, handedBack: 0 });
      expect(fcm.seen).toHaveLength(0);
      const waiting = (await tx.unsafe(
        `select count(*)::int as n from app.notification_deliveries where notification_id = '${IDS.notification}' and status = 'pending'`,
      )) as Array<{ n: number }>;
      expect(waiting[0]!.n).toBe(3);
    });
  });
});
