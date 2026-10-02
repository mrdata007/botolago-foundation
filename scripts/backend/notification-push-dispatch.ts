// Sends the queued phone-push notifications once: claims a batch, sends each
// through the browser's push service, records the outcome. Counts only are
// printed; no destination, key or message text is ever written.
//
//   bun scripts/backend/notification-push-dispatch.ts --check-config   # settings only, no database
//   bun scripts/backend/notification-push-dispatch.ts                  # one batch
//
// Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_PROJECT_ID,
// WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_SUBJECT and,
// optionally, WEB_PUSH_BATCH_LIMIT (1 to 200, default 100).

import {
  readPushRunnerConfiguration,
  runPushDispatch,
} from "../../src/backend/notifications/worker/push-runner";
import { SupabaseNotificationWorkerGateway } from "../../src/backend/notifications/worker/gateway.server";

async function main() {
  if (process.argv.includes("--check-config")) {
    const configuration = readPushRunnerConfiguration(process.env);
    console.log(JSON.stringify({ ok: true, batchLimit: configuration.limit }));
    return;
  }
  const result = await runPushDispatch(new SupabaseNotificationWorkerGateway(), process.env);
  console.log(JSON.stringify(result));
}

main().catch((error: unknown) => {
  // The message names the setting at fault; it never contains a key or a destination.
  console.error(error instanceof Error ? error.message : "The push dispatch failed.");
  process.exit(1);
});
