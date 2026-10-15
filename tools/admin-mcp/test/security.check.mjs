import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { EncryptedStore, now, digest } from "../src/store.mjs";
import { requireStaff } from "../src/backend.mjs";
import { readConfig } from "../src/config.mjs";
import { renderPage } from "../src/pages.mjs";
import { callTool, tools } from "../src/mcp.mjs";
import { multipartBody } from "../src/edge-tools.mjs";
import { fixture, staff, session } from "./helpers.mjs";

test("persistent storage encrypts tokens, authenticates row identities, expires records and consumes once", () => {
  const dir = mkdtempSync(join(tmpdir(), "bgo-store-")),
    key = randomBytes(32);
  const store = new EncryptedStore(dir, key);
  try {
    store.put("a", { token: "super-secret" }, now() + 60);
    for (const file of readdirSync(dir))
      assert.equal(readFileSync(join(dir, file)).includes(Buffer.from("super-secret")), false);
    assert.equal(store.take("a").token, "super-secret");
    assert.equal(store.take("a"), undefined);
    store.put("expired", {}, now() - 1);
    assert.equal(store.get("expired"), undefined);
    store.put("a", { token: "value" }, now() + 60);
    store.db.prepare("UPDATE records SET id = 'b' WHERE id = 'a'").run();
    assert.throws(() => store.get("b"));
    store.put("c", { token: "value" }, now() + 60);
    store.db.prepare("UPDATE records SET expires = expires + 3600 WHERE id = 'c'").run();
    assert.throws(() => store.get("c"));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("revocation cannot be undone by a concurrent upstream refresh", async (t) => {
  const f = await fixture(t),
    old = session();
  old.expires_at = now() - 1;
  const expires = now() + 3600;
  f.store.put(
    "grant:grant",
    { session: old, userId: old.user.id, clientId: "client", expires },
    expires,
  );
  f.store.put(
    `access:${digest("token")}`,
    { grantId: "grant", clientId: "client", accessExpiry: expires },
    expires,
  );
  let release, entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  f.backend.refresh = async () => {
    entered();
    await gate;
    return session();
  };
  const operation = f.oauth.withGrant("grant", async () => {});
  await started;
  const revoke = f.oauth.revokeToken({ client_id: "client" }, { token: "token" });
  release();
  await Promise.all([operation, revoke]);
  assert.equal(f.store.get("grant:grant"), undefined);
  await assert.rejects(() => f.oauth.verifyAccessToken("token"));
});

test("configuration refuses secret keys and insecure remote origins", () => {
  const config = {
    ADMIN_MCP_ORIGIN: "https://admin-mcp.example.test",
    ADMIN_MCP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  };
  assert.equal(readConfig(config).resource, "https://admin-mcp.example.test/mcp");
  assert.throws(() => readConfig({ ...config, SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" }));
  assert.throws(() => readConfig({ ...config, ADMIN_MCP_ORIGIN: "http://remote.example.test" }));
  assert.throws(() => readConfig({ ...config, ADMIN_MCP_ENCRYPTION_KEY: "bad" }));
});

test("staff authorization fails closed on MFA, verification, revocation and malformed contexts", () => {
  assert.equal(requireStaff(staff), staff);
  assert.doesNotThrow(() => requireStaff({ ...staff, recentAuthSufficient: false }));
  for (const patch of [
    { currentAal: "aal1" },
    { isStaff: false },
    { status: "revoked" },
    { emailVerified: false },
    { mfaEnrolled: false },
    { revoked: true },
    { permissions: null },
  ])
    assert.throws(() => requireStaff({ ...staff, ...patch }));
  assert.throws(() => requireStaff(null));
});

test("browser pages escape client metadata and provide French/Arabic forms without scripts", () => {
  const pending = {
    stage: "password",
    clientName: '<script>alert("x")</script>',
    redirectUri: "https://example.test",
    csrf: "nonce",
  };
  for (const lang of ["fr", "ar"]) {
    const html = renderPage({ id: "id", pending, lang });
    assert.equal(html.includes("<script>"), false);
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes(`dir="${lang === "ar" ? "rtl" : "ltr"}"`));
    assert.ok(html.includes('autocomplete="current-password"'));
  }
});

test("unknown/internal actions and malformed arguments never reach the backend", async (t) => {
  const f = await fixture(t);
  const grantId = "grant";
  f.store.put(
    `grant:${grantId}`,
    { session: session(), userId: "user-one", expires: now() + 60 },
    now() + 60,
  );
  for (const name of [
    "execute_sql",
    "admin_bootstrap_first_platform_admin",
    "admin_start_session_revocation_worker",
    "editorial_write_secret_for_service",
  ])
    assert.equal((await callTool(f.oauth, grantId, name)).isError, true);
  const invalid = await callTool(f.oauth, grantId, "admin_get_user", {
    p_user_id: "x",
    unexpected: "value",
  });
  assert.equal(invalid.structuredContent.code, "invalid_arguments");
  assert.equal(f.backend.calls.length, 0);
  assert.equal(new Set(tools.map((t) => t.name)).size, tools.length);
});

test("upstream refresh is serialized and a revoked staff context blocks every operation", async (t) => {
  const f = await fixture(t),
    old = session();
  old.expires_at = now() - 1;
  f.store.put(
    "grant:grant",
    { session: old, userId: old.user.id, expires: now() + 60 },
    now() + 60,
  );
  await Promise.all([
    f.oauth.withGrant("grant", async () => {}),
    f.oauth.withGrant("grant", async () => {}),
  ]);
  assert.equal(f.backend.refreshes, 1);
  f.backend.denied = true;
  assert.equal(
    (await callTool(f.oauth, "grant", "admin_get_user", { p_user_id: "x" })).isError,
    true,
  );
  assert.equal(f.backend.calls.length, 0);
});

test("uploads use supplied bytes, preserve fields and reject oversized or malformed base64", () => {
  const args = {
    file: {
      name: "photo.png",
      mimeType: "image/png",
      base64: Buffer.from("image").toString("base64"),
    },
    altText: "Football",
    width: 100,
    height: 200,
    credit: "Photographer",
  };
  const form = multipartBody("admin_upload_news_media", args);
  assert.equal(form.get("file").size, 5);
  assert.equal(form.get("credit"), "Photographer");
  assert.throws(() =>
    multipartBody("admin_upload_news_media", {
      ...args,
      file: { ...args.file, base64: "https://example.test/image" },
    }),
  );
});

test("tool errors never return raw backend diagnostics; recent auth returns a browser link", async (t) => {
  const f = await fixture(t);
  f.store.put(
    "grant:grant",
    { session: session(), userId: "user-one", clientId: "client", expires: now() + 60 },
    now() + 60,
  );
  f.backend.recent = true;
  const recent = await callTool(f.oauth, "grant", "admin_get_user", { p_user_id: "x" });
  assert.equal(recent.structuredContent.code, "recent_auth_required");
  assert.equal(new URL(recent.structuredContent.signInUrl).origin, f.origin);
  f.backend.rpc = async () => ({
    data: null,
    error: { message: "raw token=credential, relation app_private.users" },
  });
  const failure = await callTool(f.oauth, "grant", "admin_get_user", { p_user_id: "x" });
  assert.equal(JSON.stringify(failure).includes("app_private"), false);
  assert.equal(JSON.stringify(failure).includes("credential"), false);
});
