/**
 * Erases the accounts whose deletion has fallen due
 * (migration 20261006143700_account_deletion_automatic).
 *
 * pg_cron's `account-deletion-tick` posts here through pg_net with the
 * scheduler token, once an hour while a request is due. For each request the
 * database hands over (api.service_claim_account_deletions, nothing while the
 * switch is off):
 *
 *   1. the avatar files are removed through the Storage API. Storage refuses a
 *      SQL delete of its rows, and one would leave the file behind; the
 *      database refuses to erase an account whose files are still listed;
 *   2. api.service_erase_account erases everything else in one transaction,
 *      ending with the Auth user;
 *   3. a confirmation e-mail goes to the address the claim handed over, which
 *      lives only in this function's memory; the database records only
 *      whether it went.
 *
 * A failure at 1 or 2 hands the request back with a short code
 * (api.service_release_account_deletion) for the next hourly pass; nothing is
 * half-erased, since 2 is one transaction. Answers carry counts and codes,
 * never an id, an address or a provider message: pg_net keeps response bodies
 * in net._http_response.
 */
import { emailDispatchConfiguration, type EmailRpcClient } from "./notification-email-dispatch.ts";
import { schedulerTokenRefusal } from "./scheduler-token.ts";

const RESEND_URL = "https://api.resend.com/emails";
const MAX_REQUEST_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECIPIENT = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;
const ERROR_CODE = /^account_deletion_[a-z_]{1,60}$/;

/** The avatars bucket, as much of the Storage API as the worker uses. */
export interface AvatarStore {
  /** Object names directly under `folder` (the account id). */
  list(folder: string): Promise<string[]>;
  /** Removes `<folder>/<name>` paths. */
  remove(paths: string[]): Promise<void>;
}

export interface AccountDeletionDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: EmailRpcClient;
  readonly avatars: AvatarStore;
  readonly fetchImpl?: typeof fetch;
}

export interface ClaimedAccountDeletion {
  readonly requestId: string;
  readonly userId: string;
  readonly requestedAt: string;
  readonly email: string | null;
  readonly language: "fr" | "ar";
}

export interface AccountDeletionSummary {
  claimed: number;
  erased: number;
  released: number;
  emails: { sent: number; failed: number; skipped: number };
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

class RpcFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function rpc(client: EmailRpcClient, name: string, args: Record<string, unknown>) {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) {
    const message = String((result.error as { message?: unknown }).message ?? "");
    throw new RpcFailure(ERROR_CODE.test(message) ? message : "database_unavailable");
  }
  return result.data;
}

/** The claim's answer, or null when it is not the expected shape. */
export function readClaims(value: unknown): ClaimedAccountDeletion[] | null {
  if (!Array.isArray(value)) return null;
  const claims: ClaimedAccountDeletion[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { requestId, userId, requestedAt, email, language } = item as Record<string, unknown>;
    if (typeof requestId !== "string" || !UUID.test(requestId)) return null;
    if (typeof userId !== "string" || !UUID.test(userId)) return null;
    if (typeof requestedAt !== "string" || Number.isNaN(Date.parse(requestedAt))) return null;
    claims.push({
      requestId,
      userId: userId.toLowerCase(),
      requestedAt,
      email:
        typeof email === "string" && email.length <= 254 && RECIPIENT.test(email) ? email : null,
      language: language === "ar" ? "ar" : "fr",
    });
  }
  return claims;
}

function longDate(iso: string, language: "fr" | "ar"): string {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-MA" : "fr-FR", {
    timeZone: "Africa/Casablanca",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** The confirmation, in the account's language. */
export function confirmationEmail(
  claim: Pick<ClaimedAccountDeletion, "requestedAt" | "language">,
  erasedAt: Date,
): { subject: string; text: string; html: string } {
  const asked = longDate(claim.requestedAt, claim.language);
  const erased = longDate(erasedAt.toISOString(), claim.language);
  const lines =
    claim.language === "ar"
      ? {
          subject: "تم حذف حسابك على BotolaGO",
          body: [
            "مرحباً،",
            `كما طلبت يوم ${asked}، تم حذف حسابك على BotolaGO والبيانات المرتبطة به نهائياً يوم ${erased}.`,
            "هذه آخر رسالة نرسلها إليك بخصوص هذا الحساب. لا نحتفظ بعنوان بريدك الإلكتروني بعد إرسالها.",
            "لأي سؤال: support@botolago.com",
            "فريق BotolaGO",
          ],
        }
      : {
          subject: "Votre compte BotolaGO a été supprimé",
          body: [
            "Bonjour,",
            `Comme vous l'avez demandé le ${asked}, votre compte BotolaGO et les données qui y étaient liées ont été supprimés définitivement le ${erased}.`,
            "Ce message est le dernier que nous vous envoyons au sujet de ce compte. Nous ne conservons pas votre adresse e-mail après son envoi.",
            "Pour toute question : support@botolago.com",
            "L'équipe BotolaGO",
          ],
        };
  const dir = claim.language === "ar" ? "rtl" : "ltr";
  return {
    subject: lines.subject,
    text: lines.body.join("\n\n"),
    html:
      `<!doctype html><html lang="${claim.language}" dir="${dir}"><body>` +
      lines.body.map((line) => `<p>${escapeHtml(line)}</p>`).join("") +
      "</body></html>",
  };
}

async function removeAvatars(store: AvatarStore, userId: string): Promise<number> {
  const names = (await store.list(userId)).filter(
    (name) => name.length > 0 && !name.includes("/") && name !== "." && name !== "..",
  );
  if (names.length === 0) return 0;
  await store.remove(names.map((name) => `${userId}/${name}`));
  // Listed again: a file that is still there must stop the erasure here
  // rather than at the database's own check.
  if ((await store.list(userId)).length > 0) throw new RpcFailure("avatar_removal_incomplete");
  return names.length;
}

type EmailOutcome = "sent" | "no_address" | "not_configured" | "failed";

async function sendConfirmation(
  claim: ClaimedAccountDeletion,
  dependencies: AccountDeletionDependencies,
  erasedAt: Date,
): Promise<EmailOutcome> {
  if (!claim.email) return "no_address";
  let config: ReturnType<typeof emailDispatchConfiguration>;
  try {
    config = emailDispatchConfiguration(dependencies.environment);
  } catch {
    // No Resend key (EmailDispatchError): the account is erased all the same.
    return "not_configured";
  }
  const message = confirmationEmail(claim, erasedAt);
  try {
    const response = await (dependencies.fetchImpl ?? fetch)(RESEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        // A retried pass never sends the same confirmation twice.
        "idempotency-key": `account-deletion-${claim.requestId}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [claim.email],
        reply_to: config.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function runAccountDeletions(
  dependencies: AccountDeletionDependencies,
  now: () => Date = () => new Date(),
): Promise<AccountDeletionSummary> {
  const summary: AccountDeletionSummary = {
    claimed: 0,
    erased: 0,
    released: 0,
    emails: { sent: 0, failed: 0, skipped: 0 },
  };
  const claims = readClaims(
    await rpc(dependencies.client, "service_claim_account_deletions", {
      p_limit: 5,
      p_lease_seconds: 900,
    }),
  );
  if (claims === null) throw new RpcFailure("invalid_claim");
  summary.claimed = claims.length;

  for (const claim of claims) {
    let removed = 0;
    try {
      try {
        removed = await removeAvatars(dependencies.avatars, claim.userId);
      } catch (error) {
        throw error instanceof RpcFailure ? error : new RpcFailure("avatar_removal_failed");
      }
      await rpc(dependencies.client, "service_erase_account", {
        p_request_id: claim.requestId,
        p_avatar_objects_removed: removed,
      });
    } catch (error) {
      const code = error instanceof RpcFailure ? error.code : "worker_failed";
      await rpc(dependencies.client, "service_release_account_deletion", {
        p_request_id: claim.requestId,
        p_error: code,
      }).catch(() => undefined); // the lease expires and the next pass takes it
      summary.released += 1;
      continue;
    }
    summary.erased += 1;

    const outcome = await sendConfirmation(claim, dependencies, now());
    if (outcome === "sent") summary.emails.sent += 1;
    else if (outcome === "failed") summary.emails.failed += 1;
    else summary.emails.skipped += 1;
    await rpc(dependencies.client, "service_record_account_deletion_email", {
      p_request_id: claim.requestId,
      p_outcome: outcome,
    }).catch(() => undefined);
  }
  return summary;
}

export async function handleAccountDeletionRequest(
  request: Request,
  dependencies: AccountDeletionDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return json(413, { error: "request_too_large" });
  }
  // Checked in-process, before any database call (scheduler-token.ts).
  const refusal = schedulerTokenRefusal(request, dependencies.environment);
  if (refusal) return refusal;

  try {
    return json(200, { ...(await runAccountDeletions(dependencies)) });
  } catch (error) {
    return json(503, { error: error instanceof RpcFailure ? error.code : "worker_failed" });
  }
}
