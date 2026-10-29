import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { EncryptedStore, now } from "../src/store.mjs";
import { createApp } from "../src/app.mjs";
import { digestChallenge } from "../src/oauth.mjs";

export const staff = {
  isStaff: true,
  staffPrincipalId: "principal",
  status: "active",
  emailVerified: true,
  accessAllowed: true,
  mfaEnrolled: true,
  currentAal: "aal2",
  suspended: false,
  revoked: false,
  permissions: ["users.read_support"],
  recentAuthSufficient: true,
};
export const session = (id = "user-one", suffix = "") => ({
  user: { id },
  access_token: `upstream-access-secret${suffix}`,
  refresh_token: `upstream-refresh-secret${suffix}`,
  expires_at: now() + 3600,
});
export class FakeBackend {
  calls = [];
  refreshes = 0;
  denied = false;
  recent = false;
  account = "user-one";
  async password() {
    return {
      session: session(this.account),
      factorId: "factor",
      factorType: "totp",
      challengeId: "challenge",
    };
  }
  async mfa(_pending, code) {
    if (code !== "123456") throw new Error("wrong code");
    return { session: session(this.account, "-mfa"), context: staff };
  }
  async context() {
    if (this.denied) throw new Error("revoked");
    return { ...staff, recentAuthSufficient: !this.recent };
  }
  async refresh(value) {
    this.refreshes++;
    return session(value.user.id, "-refreshed");
  }
  async rpc(value, name, args) {
    this.calls.push({ value, name, args });
    return this.recent
      ? { data: null, error: { message: "recent_auth_required" } }
      : { data: { ok: true, name }, error: null };
  }
  async edge(value, name, body) {
    this.calls.push({ value, name, body });
    return { data: { ok: true }, error: null };
  }
}
export async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "bgo-mcp-"));
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const config = { origin, resource: `${origin}/mcp` };
  const store = new EncryptedStore(directory, randomBytes(32));
  const backend = new FakeBackend();
  const { app, oauth } = createApp(config, store, backend);
  const server = await new Promise((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => resolve(server));
  });
  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const request = (path, init = {}) =>
    fetch(new URL(path, origin), { redirect: "manual", ...init });
  return { directory, origin, config, store, oauth, backend, request };
}
export async function register(f, overrides = {}) {
  const response = await f.request("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Test client",
      redirect_uris: ["http://localhost:9876/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "botolago.admin",
      ...overrides,
    }),
  });
  return { response, client: await response.json() };
}
export async function browser(f, url) {
  const page = await f.request(url);
  const cookie = page.headers.get("set-cookie")?.split(";")[0];
  const html = await page.text();
  const id = new URL(url).searchParams.get("id");
  const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  return { id, csrf, cookie, html, csp: page.headers.get("content-security-policy") };
}
export function form(f, path, flow, extra = {}, origin = f.origin) {
  return f.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: origin,
      Cookie: flow.cookie,
    },
    body: new URLSearchParams({ id: flow.id, csrf: flow.csrf, ...extra }),
  });
}
export async function login(f, flow) {
  const password = await form(f, "/session/login", flow, {
    email: "staff@example.test",
    password: "browser-only-password",
  });
  if (password.status !== 200) throw new Error(`Password status ${password.status}`);
  const verified = await form(f, "/session/verify", flow, { code: "123456" });
  return verified;
}
export async function connection(f, metadata = {}) {
  const { client } = await register(f, metadata);
  const verifier = "a".repeat(43);
  const params = new URLSearchParams({
    client_id: client.client_id,
    response_type: "code",
    redirect_uri: client.redirect_uris[0],
    code_challenge: digestChallenge(verifier),
    code_challenge_method: "S256",
    state: "original-state",
    resource: f.config.resource,
    scope: "botolago.admin",
  });
  const authorization = await f.request(`/authorize?${params}`);
  const flow = await browser(f, authorization.headers.get("location"));
  const verified = await login(f, flow);
  const redirect = new URL(verified.headers.get("location"));
  return { client, verifier, code: redirect.searchParams.get("code"), redirect, flow };
}
export async function exchange(f, c, extra = {}) {
  const response = await f.request("/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.client.client_id,
      grant_type: "authorization_code",
      code: c.code,
      code_verifier: c.verifier,
      redirect_uri: c.client.redirect_uris[0],
      resource: f.config.resource,
      ...extra,
    }),
  });
  return { response, tokens: await response.json() };
}
export async function mcp(f, token, method, params = {}) {
  const response = await f.request("/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { response, body: await response.json() };
}
