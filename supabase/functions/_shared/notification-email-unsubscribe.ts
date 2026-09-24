// One-click unsubscribe for notification emails (RFC 8058).
//
// Every email's List-Unsubscribe header points here with its token, together
// with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Gmail, Yahoo and
// Apple Mail then show their own "Unsubscribe" button; pressing it makes the
// mail provider POST to this endpoint, which turns the account's emails off
// through api.unsubscribe_notification_email. A reader who unsubscribes this
// way does not reach for "Report spam" — which is what keeps the sending
// account under the provider's complaint limit.
//
//   POST ?token=…  unsubscribe; 200 on success or if already unsubscribed.
//   GET  ?token=…  303 to the app's /unsubscribe page, which asks for a tap
//                  first: link scanners and previews only ever GET, so they
//                  can never unsubscribe anyone.
//
// The token is never logged or echoed back.
//
// Dependency-free so it runs under Bun (tests) and Deno (the Edge Function).

export interface UnsubscribeRpcClient {
  schema(name: "api"): {
    rpc(
      name: string,
      args?: Record<string, unknown>,
    ): PromiseLike<{ readonly data: unknown; readonly error: { readonly message: string } | null }>;
  };
}

export interface EmailUnsubscribeDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: UnsubscribeRpcClient;
}

const TOKEN = /^[A-Za-z0-9_-]{32}$/;
const MAX_BODY_BYTES = 1024;

function appOrigin(environment: Readonly<Record<string, string | undefined>>): string {
  const fallback = "https://botolago.com";
  const raw = environment.APP_URL?.trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (url.pathname === "/" || url.pathname === "")
      ? url.origin
      : fallback;
  } catch {
    return fallback;
  }
}

function text(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...extra,
    },
  });
}

export async function handleEmailUnsubscribeRequest(
  request: Request,
  dependencies: EmailUnsubscribeDependencies,
): Promise<Response> {
  let token = "";
  try {
    token = new URL(request.url).searchParams.get("token") ?? "";
  } catch {
    token = "";
  }
  const valid = TOKEN.test(token);

  if (request.method === "GET" || request.method === "HEAD") {
    const page = `${appOrigin(dependencies.environment)}/unsubscribe${
      valid ? `?token=${encodeURIComponent(token)}` : ""
    }`;
    return text(303, "", { location: page });
  }
  if (request.method !== "POST") return text(405, "Method not allowed", { allow: "GET, POST" });

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return text(413, "Request too large");
  }
  if (!valid) return text(400, "Invalid link");

  try {
    const { data, error } = await dependencies.client
      .schema("api")
      .rpc("unsubscribe_notification_email", { p_token: token });
    if (error) return text(503, "Try again later");
    const status =
      typeof data === "object" && data !== null && "status" in data
        ? (data as { status: unknown }).status
        : null;
    if (status === "unsubscribed" || status === "already_unsubscribed") {
      return text(200, "Unsubscribed");
    }
    return text(400, "Invalid link");
  } catch {
    return text(503, "Try again later");
  }
}
