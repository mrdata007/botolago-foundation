import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/backend/generated/database.types";
import {
  SessionRevocationWorker,
  SupabaseAuthAdminInspector,
  SupabaseSessionRevocationQueue,
  type AuthAdminClient,
  type WorkerApiClient,
} from "../../src/backend/admin/session-revocation-worker.server";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required runtime configuration: ${name}`);
  return value;
}

function integerSetting(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid runtime configuration: ${name}`);
  return parsed;
}

function createSupabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    }
    if (
      (key.startsWith("sb_secret_") || key.startsWith("sb_publishable_")) &&
      headers.get("Authorization") === `Bearer ${key}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

async function main() {
  const url = required("SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const workerId = process.env.BOTOLAGO_ADMIN_WORKER_ID?.trim() ?? `local-${crypto.randomUUID()}`;
  const client = createClient<Database>(url, serviceKey, {
    global: { fetch: createSupabaseFetch(serviceKey) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const queue = new SupabaseSessionRevocationQueue(
    client.schema("api") as unknown as WorkerApiClient,
  );
  const authAdmin = new SupabaseAuthAdminInspector(client as unknown as AuthAdminClient);
  const worker = new SessionRevocationWorker(queue, authAdmin);
  const result = await worker.run({
    workerId,
    batchSize: integerSetting("BOTOLAGO_ADMIN_REVOCATION_BATCH_SIZE", 25),
    maxBatches: integerSetting("BOTOLAGO_ADMIN_REVOCATION_MAX_BATCHES", 4),
    leaseSeconds: integerSetting("BOTOLAGO_ADMIN_REVOCATION_LEASE_SECONDS", 120),
    syntheticTest: process.env.BOTOLAGO_ADMIN_SYNTHETIC_TEST === "true",
  });

  process.stdout.write(
    `${JSON.stringify({
      event: "admin_session_revocation_worker_completed",
      ...result,
    })}\n`,
  );
}

await main().catch((error) => {
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : "worker_unavailable";
  process.stderr.write(
    `${JSON.stringify({
      event: "admin_session_revocation_worker_failed",
      code,
    })}\n`,
  );
  process.exitCode = 1;
});
