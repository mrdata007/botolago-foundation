# BotolaGO Admin MCP

A dedicated Streamable HTTP MCP for **Codex and ChatGPT**, separate from the
consumer `/mcp` endpoint on the website. It exposes 103 tools: 98 staff RPCs,
four editorial/media operations, and browser reauthentication.

Staff, roles, approvals, audit, revocation status, users/moderation, analytics,
BotolaGO+, prizes, home stories, editorial articles, Pépites, photo releases,
player data and football mappings use their existing backend contracts.
News creation and updates use the existing sanitizing `news-editorial-write`
Edge Function. File uploads use the existing news/player-photo Edge Functions.

## Why a dedicated service

Supabase's consumer OAuth code exchange creates an AAL1 session, even if the
person approving the connection used MFA. Admin RPCs require AAL2. This service
therefore performs password sign-in and verifies the enrolled TOTP or phone
factor **in the browser**, then issues its own opaque OAuth credentials to the
MCP client. It forwards the resulting Supabase **user** session to BotolaGO.

Existing database permissions, verified email, MFA, recent authentication,
independent approval, record versions, idempotency and audit still decide every
action. A connected assistant has the staff user's permissions. It cannot
approve its own requests or become a privileged worker. Bootstrap, internal
worker routines, sanitizer secrets, arbitrary SQL and arbitrary network fetch
are excluded. No Supabase service-role or secret key is accepted.

## Run locally

Use Node **24** or newer. Run these commands in `tools/admin-mcp`:

```sh
npm ci --ignore-scripts
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Put that generated value in `ADMIN_MCP_ENCRYPTION_KEY` in `.env`. Set
`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the **same** BotolaGO Production
V2 project used by the admin website. Use a publishable key, or its legacy anon
key. Set `ADMIN_MCP_ORIGIN=http://127.0.0.1:3107` for local testing.

```sh
npm start
```

The resource is `http://127.0.0.1:3107/mcp`; `/health` is a liveness check.
Sign in using an existing staff account and its enrolled second factor. This
service does not enroll factors or create staff accounts. Accounts using only
social sign-in must first set a password through BotolaGO's normal account
recovery/settings flow.

## Host once for both clients

ChatGPT needs a **public HTTPS URL**. Run one instance of this service on a
server with Node 24, a persistent private data directory and outbound HTTPS
access to the configured Supabase project. For example, configure your own
`https://admin-mcp.YOUR_DOMAIN` origin; that example is not a deployed endpoint.

Set `ADMIN_MCP_ORIGIN` to the exact public origin. Terminate TLS at your reverse
proxy and preserve the incoming `Host` header. Proxy all paths, including
`/.well-known/*`, `/authorize`, `/token`, `/register`, `/revoke`, `/session/*` and
`/mcp`. Keep the backend bound to loopback unless the hosting network isolates
it. Permit request bodies up to 42 MiB for the existing photo/document limits;
apply host-level traffic limits. Do not log HTTP bodies, authorization headers,
cookies or `/session/start` query strings.

The SQLite store encrypts every row with AES-256-GCM and keeps its directory at
0700 and database at 0600. Store the encryption key in the host's secret manager;
persist the directory and key across restarts. Run **one process per store** so
upstream refresh-token rotation stays serialized. This service needs persistent
disk; a stateless function host is not sufficient. Back up the encrypted store
and protect the encryption key separately. Deleting the store or rotating the
key requires all clients to reconnect.

Deployment does not need a database migration. It does require the existing
admin RPCs and editorial/media Edge Functions to be deployed already. Repository
AGENTS.md requires the owner's approval before deploying this service; this
change does not deploy it or change production data.

## Connect Codex

In Codex MCP settings, add an HTTP server using the deployed `/mcp` URL and
complete the browser sign-in. Equivalent CLI setup:

```sh
codex mcp add botolago-admin --url https://YOUR_ADMIN_MCP_HOST/mcp
codex mcp login botolago-admin
```

## Connect ChatGPT

In ChatGPT's app/connector settings with custom MCP/developer-mode support,
create a connector using the same deployed `/mcp` URL and OAuth authentication.
The service supports discovery, dynamic client registration, public clients,
client secrets and PKCE S256. Complete the browser password and MFA flow.
Custom connector availability depends on the account/workspace settings.

Passwords, MFA codes, upstream access tokens and refresh tokens are never tool
arguments or results. Enter credentials only in the service's browser page.

## Recent authentication and retries

The existing admin window remains 15 minutes for sensitive actions; refreshing
an MCP token never renews it. When required, the tool returns a browser
`signInUrl`. Open it, sign in with **the same staff account**, verify MFA, then
retry the original action. The connector remains connected. Connections last
at most eight hours; access credentials last ten minutes and refresh credentials
rotate. OAuth revocation disables the whole connector grant immediately.
Reusing an already-rotated refresh credential also invalidates that grant.

Use the exact idempotency key, expected timestamp, version and fingerprint from
the original operation. An upstream timeout is an unknown write outcome: inspect
the record before retrying. Actions without idempotency support must not be
retried blindly. Backend refusals are returned without raw SQL/provider errors.

## Verify and maintain

```sh
npm test
npm run catalog:check
npm audit --omit=dev
```

The tests use a fake backend and a real HTTP/OAuth/MCP server with encrypted
SQLite storage. They do not write to Supabase. The `.check.mjs` test names keep
the Node-only suite separate from the application's Bun suite.

After updating `src/backend/generated/database.types.ts`, regenerate and review
the RPC catalog, especially any newly added `admin_*` or `editorial_*` function:

```sh
npm run catalog
```

The generator preserves argument names, required fields and enum values. Explicit
nulls are accepted because PostgreSQL functions accept null arguments; the
existing backend applies each operation's semantic constraints. Metadata marks
all admin operations conservatively as potentially mutating because even some
reads append audit evidence.

For file uploads, supply actual file bytes as base64. The server never downloads
an arbitrary URL. Article HTML is sanitized by the existing trusted backend;
raw sanitizer MACs and service credentials are unavailable to tools.
