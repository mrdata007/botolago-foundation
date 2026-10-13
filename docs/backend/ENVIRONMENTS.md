# Backend environment strategy

## Project map

| Environment | Supabase target                                                   | Current state                                  |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Local       | CLI project `botolago-production-v2`                              | active for development                         |
| Test        | fresh local CLI stack per CI job                                  | active in foundation CI                        |
| Staging     | `BotolaGO Staging V2`, ref `srdrflfrfpwixsllveid`, `eu-west-3`    | active; 35 of 47 repository migrations recorded |
| Production  | `BotolaGO Production V2`, ref `tkewgajrljbwgwedqsxn`, `eu-west-3` | active; 47 repository migrations promoted       |
| Legacy      | old BotolaGO project, ref `kxpaudvntwxpahyjtxbk`                  | paused archive/reference only; never deploy    |

The repository stays unlinked by default. Hosted staging changes are applied
explicitly after local replay, pgTAP/RLS, lint, and generated-type checks pass.
Production data writes, worker schedules, and provider activation remain disabled until their separate reviewed gates pass.

## Variables

| Variable                        | Browser-visible | Purpose                                                |
| ------------------------------- | --------------- | ------------------------------------------------------ |
| `VITE_AUTH_MODE`                | yes             | explicit `mock` or `supabase` adapter selection        |
| `VITE_AUTH_GOOGLE_ENABLED`      | yes             | presentation gate; exact `true` enables Google only in Supabase Auth mode |
| `VITE_AUTH_APPLE_ENABLED`       | yes             | presentation gate; exact `true` enables Apple only in Supabase Auth mode  |
| `VITE_APP_URL`                  | yes             | canonical application origin used for Auth redirects   |
| `VITE_SUPABASE_PROJECT_ID`      | yes             | OAuth/MCP issuer project reference                     |
| `VITE_SUPABASE_URL`             | yes             | Supabase API URL                                       |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes             | publishable client key; not authorization              |
| `SUPABASE_URL`                  | server only     | SSR/Edge Supabase endpoint                             |
| `SUPABASE_PUBLISHABLE_KEY`      | server only     | user-JWT-scoped server requests                        |
| `SUPABASE_SERVICE_ROLE_KEY`     | server only     | privileged jobs only; never browser bundled            |

Provider credentials, database passwords, personal access tokens, webhook
secrets, and deployment tokens are added only in the phase that needs them and
only to the environment's secret manager.

## Configuration rules

- `.env.local` is for local values and is ignored by Git.
- `.env.example` contains sanitized placeholders only.
- CI database tests use local keys emitted by the local stack and require no
  hosted-project credentials.
- Staging and production use different projects, keys, redirect URLs, provider
  credentials, and Storage buckets.
- Production configuration changes require review and an audit trail.
- Missing production variables fail closed. Mock mode is never an automatic
  production fallback.
- Social-provider flags are presentation gates, not credentials. Keep them false until the provider, exact callback/redirect allow-list, and staging acceptance all pass.
