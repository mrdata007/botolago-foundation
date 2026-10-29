import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { digest, now, opaque } from "./store.mjs";

export const SCOPE = "botolago.admin";
const GRANT_SECONDS = 8 * 60 * 60;
const ACCESS_SECONDS = 10 * 60;
const invalidGrant = () => new InvalidGrantError("Sign in again to BotolaGO Admin.");

export class AdminOAuth {
  constructor(config, store, backend) {
    this.config = config;
    this.store = store;
    this.backend = backend;
    this.locks = new Map();
    this.clientsStore = {
      getClient: (id) => store.get(`client:${id}`),
      registerClient: async (client) => {
        if (!client.redirect_uris?.length || client.redirect_uris.length > 10)
          throw new InvalidRequestError("Invalid redirect URIs.");
        for (const value of client.redirect_uris) {
          const url = new URL(value);
          const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
          if (
            (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
            url.username ||
            url.password ||
            url.hash
          ) {
            throw new InvalidRequestError("HTTPS or HTTP loopback redirects are required.");
          }
        }
        if (client.scope?.split(" ").some((scope) => scope !== SCOPE))
          throw new InvalidScopeError("Unsupported scope.");
        const result = { ...client, scope: SCOPE, client_id: opaque(), client_id_issued_at: now() };
        // Registered clients persist across server restarts. Cap abandoned registrations.
        store.put(`client:${result.client_id}`, result, now() + 365 * 86400);
        return result;
      },
    };
  }
  resource(resource) {
    if (resource && resource.href !== this.config.resource)
      throw new InvalidRequestError("Incorrect resource.");
  }
  scopes(scopes) {
    if (scopes?.some((scope) => scope !== SCOPE)) throw new InvalidScopeError("Unsupported scope.");
  }
  pending(value) {
    const id = opaque();
    this.store.put(`pending:${digest(id)}`, { ...value, expires: now() + 600 }, now() + 600);
    return new URL(`/session/start?id=${id}`, this.config.origin).href;
  }
  async authorize(client, params, res) {
    this.resource(params.resource);
    this.scopes(params.scopes);
    if (!params.codeChallenge) throw new InvalidRequestError("PKCE is required.");
    const url = this.pending({
      kind: "authorize",
      clientId: client.client_id,
      clientName: client.client_name,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      stage: "password",
    });
    res.redirect(303, url);
  }
  async challengeForAuthorizationCode(client, code) {
    const value = this.store.get(`code:${digest(code)}`);
    if (!value || value.clientId !== client.client_id) throw invalidGrant();
    return value.codeChallenge;
  }
  async exchangeAuthorizationCode(client, code, verifier, redirectUri, resource) {
    this.resource(resource);
    const key = `code:${digest(code)}`;
    const value = this.store.get(key);
    if (
      !value ||
      value.clientId !== client.client_id ||
      redirectUri !== value.redirectUri ||
      (verifier !== undefined && digestChallenge(verifier) !== value.codeChallenge)
    )
      throw invalidGrant();
    // The SDK requires and validates PKCE before invoking this method, and
    // passes undefined here after successful local validation.
    if (!this.store.take(key)) throw invalidGrant();
    const grantId = opaque();
    const expires = now() + GRANT_SECONDS;
    this.store.put(
      `grant:${grantId}`,
      {
        clientId: client.client_id,
        session: value.session,
        userId: value.session.user.id,
        expires,
      },
      expires,
    );
    return this.issue(grantId, client.client_id, expires);
  }
  issue(grantId, clientId, expires) {
    const access = opaque(),
      refresh = opaque();
    const accessExpiry = Math.min(now() + ACCESS_SECONDS, expires);
    const record = { grantId, clientId, expires };
    this.store.put(`access:${digest(access)}`, { ...record, accessExpiry }, accessExpiry);
    this.store.put(`refresh:${digest(refresh)}`, record, expires);
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: accessExpiry - now(),
      scope: SCOPE,
    };
  }
  async exchangeRefreshToken(client, token, scopes, resource) {
    this.resource(resource);
    this.scopes(scopes);
    const key = `refresh:${digest(token)}`,
      record = this.store.get(key);
    if (!record) {
      const used = this.store.get(`used-refresh:${digest(token)}`);
      if (used?.clientId === client.client_id) {
        await this.locked(used.grantId, async () => this.store.delete(`grant:${used.grantId}`));
      }
      throw invalidGrant();
    }
    if (record.clientId !== client.client_id) throw invalidGrant();
    await this.withGrant(record.grantId, async () => {});
    if (!this.store.take(key)) {
      await this.locked(record.grantId, async () => this.store.delete(`grant:${record.grantId}`));
      throw invalidGrant();
    }
    this.store.put(`used-refresh:${digest(token)}`, record, record.expires);
    return this.issue(record.grantId, record.clientId, record.expires);
  }
  async verifyAccessToken(token) {
    const record = this.store.get(`access:${digest(token)}`);
    if (!record) throw new InvalidTokenError("Sign in to BotolaGO Admin.");
    try {
      await this.withGrant(record.grantId, async () => {});
    } catch {
      throw new InvalidTokenError("Staff session is no longer valid. Sign in again.");
    }
    return {
      token,
      clientId: record.clientId,
      scopes: [SCOPE],
      expiresAt: record.accessExpiry,
      resource: new URL(this.config.resource),
      extra: { grantId: record.grantId },
    };
  }
  async revokeToken(client, request) {
    for (const kind of ["access", "refresh", "used-refresh"]) {
      const key = `${kind}:${digest(request.token)}`,
        record = this.store.get(key);
      if (record?.clientId === client.client_id) {
        await this.locked(record.grantId, async () => {
          this.store.delete(`grant:${record.grantId}`);
          this.store.delete(key);
        });
      }
    }
  }
  async withGrant(grantId, action) {
    return this.locked(grantId, async () => {
      const grant = this.store.get(`grant:${grantId}`);
      if (!grant) throw invalidGrant();
      if ((grant.session.expires_at ?? 0) <= now() + 30) {
        grant.session = await this.backend.refresh(grant.session);
        if (grant.session.user.id !== grant.userId) throw invalidGrant();
        this.store.put(`grant:${grantId}`, grant, grant.expires);
      }
      const context = await this.backend.context(grant.session);
      return await action(grant, context);
    });
  }
  async locked(grantId, action) {
    // Revocation shares the refresh lock: an in-flight refresh must never
    // recreate a grant after it was deleted by revocation.
    const previous = this.locks.get(grantId) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.locks.set(grantId, tail);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.locks.get(grantId) === tail) this.locks.delete(grantId);
    }
  }
  reauthenticate(grantId) {
    const grant = this.store.get(`grant:${grantId}`);
    if (!grant) throw invalidGrant();
    const client = this.store.get(`client:${grant.clientId}`);
    return this.pending({
      kind: "reauthenticate",
      grantId,
      clientId: grant.clientId,
      clientName: client?.client_name,
      userId: grant.userId,
      stage: "password",
    });
  }
  async finish(id, pending, session) {
    if (pending.kind === "reauthenticate") {
      if (session.user.id !== pending.userId) throw invalidGrant();
      await this.withGrant(pending.grantId, async (grant) => {
        this.store.put(`grant:${pending.grantId}`, { ...grant, session }, grant.expires);
      });
      return undefined;
    }
    const code = opaque();
    this.store.put(`code:${digest(code)}`, { ...pending, session }, now() + 60);
    const target = new URL(pending.redirectUri);
    target.searchParams.set("code", code);
    if (pending.state !== undefined) target.searchParams.set("state", pending.state);
    return target.href;
  }
}

// SHA-256 with base64url, distinct from the hex keys used in the store.
export function digestChallenge(value) {
  return Buffer.from(digest(value), "hex").toString("base64url");
}
