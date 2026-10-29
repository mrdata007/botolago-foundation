import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, register, connection, exchange, browser, login, form, mcp } from "./helpers.mjs";
import { digest, now } from "../src/store.mjs";

test("complete browser MFA, PKCE token exchange and authenticated MCP invocation", async (t) => {
  const f = await fixture(t),
    c = await connection(f);
  assert.ok(c.flow.csp.includes(new URL(c.client.redirect_uris[0]).origin));
  assert.equal(c.redirect.searchParams.get("state"), "original-state");
  assert.equal((await exchange(f, c, { code_verifier: "wrong-verifier" })).response.status, 400);
  const { response, tokens } = await exchange(f, c);
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(tokens).includes("upstream-"), false);
  assert.equal((await exchange(f, c)).response.status, 400);
  const initialize = await mcp(f, tokens.access_token, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  assert.equal(initialize.response.status, 200);
  assert.equal(initialize.body.result.serverInfo.name, "botolago-admin");
  const first = await mcp(f, tokens.access_token, "tools/list");
  assert.equal(first.body.result.tools.length, 40);
  assert.equal(first.body.result.nextCursor, "40");
  const call = await mcp(f, tokens.access_token, "tools/call", {
    name: "admin_get_user",
    arguments: { p_user_id: "user-target" },
  });
  assert.equal(call.body.result.structuredContent.result.ok, true);
  assert.equal(f.backend.calls[0].value.access_token, "upstream-access-secret-mfa");
  assert.deepEqual(f.backend.calls[0].args, { p_user_id: "user-target" });
});

test("OAuth codes are bound to their client, redirect and resource", async (t) => {
  const f = await fixture(t),
    c = await connection(f),
    second = await register(f);
  assert.equal((await exchange(f, c, { client_id: second.client.client_id })).response.status, 400);
  assert.equal(
    (await exchange(f, c, { redirect_uri: "https://attacker.example/callback" })).response.status,
    400,
  );
  assert.equal(
    (await exchange(f, c, { resource: "https://attacker.example/mcp" })).response.status,
    400,
  );
  assert.equal((await exchange(f, c)).response.status, 200);
});

test("refresh rotates credentials, preserves the staff session age, and revocation disables both tokens", async (t) => {
  const f = await fixture(t),
    c = await connection(f),
    { tokens } = await exchange(f, c);
  const refresh = (token, clientId = c.client.client_id) =>
    f.request("/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token,
        client_id: clientId,
        resource: f.config.resource,
      }),
    });
  const second = await register(f);
  assert.equal((await refresh(tokens.refresh_token, second.client.client_id)).status, 400);
  const response = await refresh(tokens.refresh_token);
  assert.equal(response.status, 200);
  const rotated = await response.json();
  assert.notEqual(rotated.refresh_token, tokens.refresh_token);
  assert.equal(f.backend.refreshes, 0);
  const revoke = await f.request("/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: rotated.refresh_token, client_id: c.client.client_id }),
  });
  assert.equal(revoke.status, 200);
  assert.equal((await mcp(f, rotated.access_token, "tools/list")).response.status, 401);
  assert.equal((await mcp(f, tokens.access_token, "tools/list")).response.status, 401);
  assert.equal((await refresh(rotated.refresh_token)).status, 400);
});

test("a replayed rotated refresh token invalidates the entire connector grant", async (t) => {
  const f = await fixture(t),
    c = await connection(f),
    { tokens } = await exchange(f, c);
  const refresh = (token) =>
    f.request("/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token,
        client_id: c.client.client_id,
        resource: f.config.resource,
      }),
    });
  const rotated = await (await refresh(tokens.refresh_token)).json();
  assert.equal((await mcp(f, rotated.access_token, "tools/list")).response.status, 200);
  assert.equal((await refresh(tokens.refresh_token)).status, 400);
  assert.equal((await mcp(f, rotated.access_token, "tools/list")).response.status, 401);
  assert.equal((await refresh(rotated.refresh_token)).status, 400);
});

test("password/MFA submissions require the same browser, CSRF nonce, origin and pending stage", async (t) => {
  const f = await fixture(t);
  const url = f.oauth.pending({
    kind: "reauthenticate",
    stage: "password",
    userId: "user-one",
    clientId: "client",
    grantId: "grant",
  });
  const flow = await browser(f, url);
  const fields = { email: "a@example.test", password: "password" };
  assert.equal(
    (await form(f, "/session/login", flow, fields, "https://attacker.example")).status,
    403,
  );
  assert.equal((await form(f, "/session/login", { ...flow, csrf: "wrong" }, fields)).status, 403);
  assert.equal(
    (await form(f, "/session/login", { ...flow, cookie: "bgo_admin_login=other" }, fields)).status,
    403,
  );
  assert.equal((await form(f, "/session/verify", flow, { code: "123456" })).status, 400);
  assert.equal((await form(f, "/session/login", flow, fields)).status, 200);
  for (let i = 0; i < 4; i++) await form(f, "/session/verify", flow, { code: "999999" });
  assert.equal(f.store.get(`pending:${digest(flow.id)}`), undefined);
});

test("reauthentication replaces only the original user's session and keeps connector credentials", async (t) => {
  const f = await fixture(t),
    c = await connection(f),
    { tokens } = await exchange(f, c);
  const record = f.store.get(`access:${digest(tokens.access_token)}`);
  const url = f.oauth.reauthenticate(record.grantId);
  const flow = await browser(f, url);
  f.backend.account = "different-user";
  assert.equal(
    (await form(f, "/session/login", flow, { email: "other@example.test", password: "password" }))
      .status,
    400,
  );
  f.backend.account = "user-one";
  const done = await login(f, flow);
  assert.equal(done.status, 200);
  assert.equal((await mcp(f, tokens.access_token, "tools/list")).response.status, 200);
  assert.equal((await form(f, "/session/verify", flow, { code: "123456" })).status, 403);
});

test("HTTP discovery, unauthorized resource response, browser headers and redirect registration", async (t) => {
  const f = await fixture(t);
  const metadata = await f.request("/.well-known/oauth-authorization-server");
  assert.equal(metadata.status, 200);
  const info = await metadata.json();
  assert.equal(info.issuer, `${f.origin}/`);
  assert.ok(info.code_challenge_methods_supported.includes("S256"));
  const resource = await f.request("/.well-known/oauth-protected-resource/mcp");
  assert.equal((await resource.json()).resource, f.config.resource);
  const unauthorized = await f.request("/mcp", { method: "POST" });
  assert.equal(unauthorized.status, 401);
  assert.ok(unauthorized.headers.get("www-authenticate").includes("resource_metadata"));
  const page = await f.request("/session/start?id=invalid");
  assert.equal(page.status, 410);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("referrer-policy"), "same-origin");
  assert.ok(page.headers.get("content-security-policy").includes("frame-ancestors 'none'"));
  for (const url of [
    "http://remote.example.test/callback",
    "https://user:password@example.test/callback",
    "https://example.test/#fragment",
    "javascript:alert(1)",
  ]) {
    assert.equal((await register(f, { redirect_uris: [url] })).response.status, 400);
  }
});

test("expired codes and a staff revocation reject credentials without leaking provider messages", async (t) => {
  const f = await fixture(t),
    c = await connection(f);
  const record = f.store.get(`code:${digest(c.code)}`);
  f.store.put(`code:${digest(c.code)}`, record, now() - 1);
  assert.equal((await exchange(f, c)).response.status, 400);
  const next = await connection(f),
    { tokens } = await exchange(f, next);
  f.backend.denied = true;
  const denied = await mcp(f, tokens.access_token, "tools/list");
  assert.equal(denied.response.status, 401);
});

test("confidential OAuth clients must authenticate with their registered client secret", async (t) => {
  const f = await fixture(t),
    c = await connection(f, { token_endpoint_auth_method: "client_secret_post" });
  assert.ok(c.client.client_secret);
  assert.equal((await exchange(f, c)).tokens.error, "invalid_client");
  assert.equal((await exchange(f, c, { client_secret: "wrong" })).tokens.error, "invalid_client");
  assert.equal(
    (await exchange(f, c, { client_secret: c.client.client_secret })).response.status,
    200,
  );
});

test("concurrent code redemption succeeds once and catalog pagination returns every tool", async (t) => {
  const f = await fixture(t),
    c = await connection(f);
  const attempts = await Promise.all([exchange(f, c), exchange(f, c)]);
  assert.deepEqual(attempts.map((a) => a.response.status).sort(), [200, 400]);
  const token = attempts.find((a) => a.response.status === 200).tokens.access_token;
  const names = [];
  let cursor;
  do {
    const page = await mcp(f, token, "tools/list", cursor ? { cursor } : {});
    names.push(...page.body.result.tools.map((tool) => tool.name));
    cursor = page.body.result.nextCursor;
  } while (cursor);
  assert.equal(names.length, 103);
  assert.equal(new Set(names).size, 103);
});
