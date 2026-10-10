import { describe, expect, it } from "bun:test";
import {
  confirmationEmail,
  handleAccountDeletionRequest,
  readClaims,
  type AvatarStore,
} from "./account-deletion-worker.ts";
import type { EmailRpcClient } from "./notification-email-dispatch.ts";

const TOKEN = "c".repeat(64);
const SCHEDULER = { BOTOLAGO_SCHEDULER_TOKEN: TOKEN };
// Well formed, but not the configured token.
const WRONG_TOKEN = "9".repeat(64);
const API_KEY = "re_test_0123456789abcdef";
const A = {
  requestId: "11111111-1111-4111-8111-111111111111",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  requestedAt: "2026-10-06T10:00:00+00:00",
  email: "amina@example.test",
  language: "ar",
};
const D = {
  requestId: "22222222-2222-4222-8222-222222222222",
  userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  requestedAt: "2026-10-06T11:00:00+00:00",
  email: null,
  language: "fr",
};

interface Call {
  name: string;
  args: Record<string, unknown>;
}

function fakeClient(
  options: {
    claims?: unknown;
    eraseError?: Record<string, string>;
  } = {},
) {
  const calls: Call[] = [];
  const client: EmailRpcClient = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown> = {}) {
          calls.push({ name, args });
          const ok = (data: unknown) => Promise.resolve({ data, error: null });
          switch (name) {
            case "service_claim_account_deletions":
              return ok(options.claims ?? [A, D]);
            case "service_erase_account": {
              const message = options.eraseError?.[String(args.p_request_id)];
              return message
                ? Promise.resolve({ data: null, error: { code: "PT409", message } })
                : ok({ erased: true });
            }
            default:
              return ok(true);
          }
        },
      };
    },
  };
  return { client, calls };
}

function store(files: Record<string, string[]>, failRemove = false) {
  const removed: string[][] = [];
  const avatars: AvatarStore = {
    list: (folder) => Promise.resolve([...(files[folder] ?? [])]),
    remove: (paths) => {
      if (failRemove) return Promise.reject(new Error("storage down"));
      removed.push(paths);
      for (const path of paths) {
        const [folder, name] = path.split("/");
        files[folder] = (files[folder] ?? []).filter((entry) => entry !== name);
      }
      return Promise.resolve();
    },
  };
  return { avatars, removed };
}

function provider(status = 200) {
  const sent: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    sent.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify({ id: "email-1" }), { status }));
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

function request(token = TOKEN, method = "POST") {
  return new Request("https://example.test/functions/v1/account-deletion-worker", {
    method,
    headers: { "content-type": "application/json", "x-botolago-scheduler-token": token },
    body: method === "POST" ? '{"job":"erase"}' : undefined,
  });
}

describe("account deletion worker", () => {
  it("removes the avatar, erases, confirms by e-mail and records only the outcome", async () => {
    const { client, calls } = fakeClient();
    const { avatars, removed } = store({ [A.userId]: ["avatar.jpg"] });
    const { fetchImpl, sent } = provider();
    const response = await handleAccountDeletionRequest(request(), {
      environment: { ...SCHEDULER, RESEND_API_KEY: API_KEY },
      client,
      avatars,
      fetchImpl,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 2,
      erased: 2,
      released: 0,
      emails: { sent: 1, failed: 0, skipped: 1 },
    });
    expect(removed).toEqual([[`${A.userId}/avatar.jpg`]]);

    // Files first, then the erasure, then the record: for each account in turn.
    expect(calls.map((call) => call.name)).toEqual([
      "service_claim_account_deletions",
      "service_erase_account",
      "service_record_account_deletion_email",
      "service_erase_account",
      "service_record_account_deletion_email",
    ]);
    expect(calls[1].args).toEqual({ p_request_id: A.requestId, p_avatar_objects_removed: 1 });
    expect(calls[2].args).toEqual({ p_request_id: A.requestId, p_outcome: "sent" });
    expect(calls[4].args).toEqual({ p_request_id: D.requestId, p_outcome: "no_address" });

    expect(sent).toHaveLength(1);
    const body = JSON.parse(String(sent[0].init.body)) as Record<string, unknown>;
    expect(body.to).toEqual([A.email]);
    expect(body.subject).toBe("تم حذف حسابك على BotolaGO");
    expect(String(body.html)).toContain('dir="rtl"');
    expect((sent[0].init.headers as Record<string, string>)["idempotency-key"]).toBe(
      `account-deletion-${A.requestId}`,
    );
  });

  it("hands a request back when its files cannot be removed, and erases nothing of it", async () => {
    const { client, calls } = fakeClient({ claims: [A] });
    const { avatars } = store({ [A.userId]: ["avatar.png"] }, true);
    const response = await handleAccountDeletionRequest(request(), {
      environment: SCHEDULER,
      client,
      avatars,
    });
    expect(await response.json()).toMatchObject({ claimed: 1, erased: 0, released: 1 });
    expect(calls.map((call) => call.name)).not.toContain("service_erase_account");
    expect(calls.at(-1)).toEqual({
      name: "service_release_account_deletion",
      args: { p_request_id: A.requestId, p_error: "avatar_removal_failed" },
    });
  });

  it("passes the database's refusal code on, and never a free-form message", async () => {
    const { client, calls } = fakeClient({
      claims: [A, D],
      eraseError: {
        [A.requestId]: "account_deletion_staff_account",
        [D.requestId]: 'duplicate key value violates "x" for amina@example.test',
      },
    });
    const { avatars } = store({});
    await handleAccountDeletionRequest(request(), { environment: SCHEDULER, client, avatars });
    const releases = calls.filter((call) => call.name === "service_release_account_deletion");
    expect(releases.map((call) => call.args.p_error)).toEqual([
      "account_deletion_staff_account",
      "database_unavailable",
    ]);
  });

  it("still erases without a mail key, and says the mail was not configured", async () => {
    const { client, calls } = fakeClient({ claims: [A] });
    const { avatars } = store({});
    const response = await handleAccountDeletionRequest(request(), {
      environment: SCHEDULER,
      client,
      avatars,
    });
    expect(await response.json()).toMatchObject({ erased: 1, emails: { skipped: 1 } });
    expect(calls.at(-1)?.args).toEqual({ p_request_id: A.requestId, p_outcome: "not_configured" });
  });

  it("refuses a caller without the scheduler token, and anything but POST", async () => {
    const { client, calls } = fakeClient();
    const { avatars } = store({});
    expect(
      (
        await handleAccountDeletionRequest(request(WRONG_TOKEN), {
          environment: SCHEDULER,
          client,
          avatars,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await handleAccountDeletionRequest(request("nope"), {
          environment: SCHEDULER,
          client,
          avatars,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await handleAccountDeletionRequest(request(TOKEN, "GET"), {
          environment: SCHEDULER,
          client,
          avatars,
        })
      ).status,
    ).toBe(405);
    // Refused in-process: not even the token is checked through the database.
    expect(calls).toEqual([]);
  });
});

describe("readClaims", () => {
  it("keeps a well-formed claim and drops an address that is not one", () => {
    expect(readClaims([{ ...A, email: "not an address" }])).toEqual([
      { ...A, email: null, language: "ar" },
    ]);
  });

  it("refuses the whole answer when one entry is malformed", () => {
    expect(readClaims([A, { ...D, requestId: "x" }])).toBeNull();
    expect(readClaims({})).toBeNull();
  });
});

describe("confirmationEmail", () => {
  it("states both dates in French, in Morocco's calendar", () => {
    const message = confirmationEmail(
      { requestedAt: "2026-10-06T23:30:00+00:00", language: "fr" },
      new Date("2026-10-13T12:00:00Z"),
    );
    expect(message.subject).toBe("Votre compte BotolaGO a été supprimé");
    // 23:30 UTC on the 6th is already the 7th in Casablanca (UTC+1).
    expect(message.text).toContain("le 7 octobre 2026");
    expect(message.text).toContain("le 13 octobre 2026");
    expect(message.text).toContain("support@botolago.com");
    expect(message.html).toContain('lang="fr" dir="ltr"');
  });

  it("writes the Arabic one right to left, with the same facts", () => {
    const message = confirmationEmail(
      { requestedAt: "2026-10-06T10:00:00+00:00", language: "ar" },
      new Date("2026-10-13T12:00:00Z"),
    );
    expect(message.html).toContain('lang="ar" dir="rtl"');
    expect(message.text).toContain("support@botolago.com");
    expect(message.text.split("\n\n")).toHaveLength(5);
  });
});
