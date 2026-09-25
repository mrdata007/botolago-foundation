/**
 * Production alerts by email (migration 20260926001000_ops_alert_email).
 *
 * app_private.ops_alert_tick (or the owner's app_private.ops_alert_test)
 * posts `{ subject, text }` here through pg_net with the scheduler token, the
 * same way pg_cron wakes notification-email-dispatch. The recipient never
 * comes from the request: it is the one address the owner stored in the
 * database (api.service_ops_alert_email_target), so this endpoint cannot be
 * made to mail anyone else. Sender, key and domain are the site's own
 * (RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO), read exactly as the
 * dispatcher reads them.
 *
 * Answers carry a status and an error code only, never the address, the key
 * or the provider's message: pg_net keeps response bodies in
 * net._http_response, which is how delivery is checked.
 */
import {
  EmailDispatchError,
  emailDispatchConfiguration,
  type EmailRpcClient,
} from "./notification-email-dispatch.ts";

const RESEND_URL = "https://api.resend.com/emails";
const MAX_REQUEST_BYTES = 8192;
const MAX_SUBJECT_LENGTH = 200;
const MAX_TEXT_LENGTH = 4000;
const RECIPIENT = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;

export interface OpsAlertEmailDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: EmailRpcClient;
  readonly fetchImpl?: typeof fetch;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function rpc(client: EmailRpcClient, name: string, args: Record<string, unknown>) {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) throw new EmailDispatchError("database_unavailable");
  return result.data;
}

/** `{ subject, text }`, bounded, with no line break in the subject. */
export function readOpsAlertMessage(value: unknown): { subject: string; text: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { subject, text } = value as Record<string, unknown>;
  if (typeof subject !== "string" || typeof text !== "string") return null;
  const cleanSubject = subject.trim();
  const cleanText = text.trim();
  if (!cleanSubject || cleanSubject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(cleanSubject)) {
    return null;
  }
  if (!cleanText || cleanText.length > MAX_TEXT_LENGTH) return null;
  return { subject: cleanSubject, text: cleanText };
}

/** Only the `name` of a Resend error, never its message (it may repeat the address). */
async function providerErrorName(response: Response): Promise<string> {
  try {
    const body = JSON.parse((await response.text()).slice(0, 4096)) as { name?: unknown };
    return typeof body.name === "string" && /^[a-z_]{1,60}$/.test(body.name)
      ? body.name
      : "provider_error";
  } catch {
    return "provider_error";
  }
}

export async function handleOpsAlertEmailRequest(
  request: Request,
  dependencies: OpsAlertEmailDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return json(413, { error: "request_too_large" });
  }
  const token = request.headers.get("x-botolago-scheduler-token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return json(401, { error: "unauthorized" });
  try {
    const verified = await rpc(dependencies.client, "service_verify_scheduler_token", {
      p_token: token,
    });
    if (verified !== true) return json(401, { error: "unauthorized" });
  } catch {
    return json(503, { error: "database_unavailable" });
  }

  let message: { subject: string; text: string } | null = null;
  try {
    const raw = await request.text();
    if (raw.length <= MAX_REQUEST_BYTES) message = readOpsAlertMessage(JSON.parse(raw));
  } catch {
    message = null;
  }
  if (!message) return json(400, { error: "invalid_message" });

  let config: ReturnType<typeof emailDispatchConfiguration>;
  try {
    config = emailDispatchConfiguration(dependencies.environment);
  } catch (error) {
    const code = error instanceof EmailDispatchError ? error.code : "invalid_runtime_configuration";
    return json(503, { error: code });
  }

  let recipient: unknown;
  try {
    recipient = await rpc(dependencies.client, "service_ops_alert_email_target", {});
  } catch {
    return json(503, { error: "database_unavailable" });
  }
  if (typeof recipient !== "string" || recipient.length > 254 || !RECIPIENT.test(recipient)) {
    return json(409, { error: "recipient_not_configured" });
  }

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(RESEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [recipient],
        reply_to: config.replyTo,
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch {
    return json(502, { error: "provider_unreachable" });
  }
  if (!response.ok) {
    return json(502, { error: await providerErrorName(response), status: response.status });
  }
  let id: unknown = null;
  try {
    id = ((await response.json()) as { id?: unknown }).id;
  } catch {
    id = null;
  }
  return json(200, { sent: true, id: typeof id === "string" ? id.slice(0, 80) : null });
}
