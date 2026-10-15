import { test } from "node:test";
import assert from "node:assert/strict";
import { Backend } from "../src/backend.mjs";
import { session, staff } from "./helpers.mjs";

test("password sign-in refuses an account without an enrolled verified second factor", async () => {
  const backend = new Backend({});
  backend.client = () => ({
    auth: {
      signInWithPassword: async () => ({
        data: {
          session: session(),
          user: { factors: [{ id: "factor", status: "unverified", factor_type: "totp" }] },
        },
        error: null,
      }),
    },
  });
  await assert.rejects(
    () => backend.password("staff@example.test", "password"),
    /verified second factor/,
  );
});

test("verified MFA must also produce an authorized AAL2 staff context", async () => {
  const backend = new Backend({});
  backend.client = () => ({
    auth: {
      setSession: async () => ({ error: null }),
      mfa: { verify: async () => ({ data: { access_token: "new-token" }, error: null }) },
      getSession: async () => ({ data: { session: session() }, error: null }),
    },
    schema: () => ({ rpc: async () => ({ data: { ...staff, currentAal: "aal1" }, error: null }) }),
  });
  await assert.rejects(() =>
    backend.mfa({ session: session(), factorId: "factor", challengeId: "challenge" }, "123456"),
  );
});

test("upstream refresh cannot substitute a different user's session", async () => {
  const backend = new Backend({});
  backend.client = () => ({
    auth: {
      refreshSession: async () => ({ data: { session: session("different-user") }, error: null }),
    },
  });
  await assert.rejects(() => backend.refresh(session()));
});

test("the backend client uses the supplied user token and disables session persistence", async () => {
  const backend = new Backend({
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_example",
  });
  const client = backend.client("user-token");
  assert.equal(client.headers.Authorization, "Bearer user-token");
  assert.equal(client.auth.persistSession, false);
  assert.equal(client.auth.autoRefreshToken, false);
});
