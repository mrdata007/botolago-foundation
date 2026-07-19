# Backend environment strategy

## Project map

| Environment | Supabase target                                                    | Current state                            |
| ----------- | ------------------------------------------------------------------ | ---------------------------------------- |
| Local       | CLI project `botolago-production-v2`                               | active for development                   |
| Test        | fresh local CLI stack per CI job                                   | active in foundation CI                  |
| Staging     | separate project, to be created before Phase 2 integration testing | not created                              |
| Production  | `BotolaGO Production V2`, ref `tkewgajrljbwgwedqsxn`, `eu-west-3`  | created and empty; no migrations applied |
| Legacy      | old BotolaGO project                                               | archive/reference only; never deploy     |

The repository is intentionally not linked to a hosted project during Phase 1.
This prevents an accidental `db push` from bypassing review.

## Variables

| Variable                        | Browser-visible | Purpose                                                |
| ------------------------------- | --------------- | ------------------------------------------------------ |
| `VITE_AUTH_MODE`                | yes             | explicit `mock` or future `supabase` adapter selection |
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
