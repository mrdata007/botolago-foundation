// Checks the scheduler token that pg_cron presents (through pg_net) to the
// scheduled Edge Functions, without touching the database.
//
// The token is generated inside the database (Vault secret
// `botolago_scheduler_token`, migration 20260924140100) and sent in the
// `x-botolago-scheduler-token` header. The functions are deployed with
// verify_jwt = false, so anyone on the internet can reach them; the check
// therefore runs in-process against the Edge Function secret
// BOTOLAGO_SCHEDULER_TOKEN, a copy of the Vault value, and a caller without it
// never reaches a service-role call. Checking it through
// api.service_verify_scheduler_token instead would make every anonymous
// request run a privileged database function first.
//
// Fails closed: when the secret is missing or malformed nothing is accepted,
// and the caller learns only that the function is not configured.
//
// Rotation: change the Vault secret and BOTOLAGO_SCHEDULER_TOKEN together
// (docs/backend/EMAIL_NOTIFICATIONS.md, "Scheduler token").

export const SCHEDULER_TOKEN_HEADER = "x-botolago-scheduler-token";
export const SCHEDULER_TOKEN_SECRET = "BOTOLAGO_SCHEDULER_TOKEN";

const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

export type SchedulerTokenCheck = "accepted" | "unauthorized" | "not_configured";

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function checkSchedulerToken(
  request: Request,
  environment: Readonly<Record<string, string | undefined>>,
): SchedulerTokenCheck {
  const expected = environment[SCHEDULER_TOKEN_SECRET]?.trim() ?? "";
  if (!TOKEN_SHAPE.test(expected)) return "not_configured";
  const received = request.headers.get(SCHEDULER_TOKEN_HEADER) ?? "";
  if (!TOKEN_SHAPE.test(received)) return "unauthorized";
  return timingSafeEqual(received, expected) ? "accepted" : "unauthorized";
}

// The response for a request the check did not accept, or null to proceed.
export function schedulerTokenRefusal(
  request: Request,
  environment: Readonly<Record<string, string | undefined>>,
): Response | null {
  const check = checkSchedulerToken(request, environment);
  if (check === "accepted") return null;
  const [status, error] =
    check === "not_configured" ? [503, "scheduler_token_not_configured"] : [401, "unauthorized"];
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
