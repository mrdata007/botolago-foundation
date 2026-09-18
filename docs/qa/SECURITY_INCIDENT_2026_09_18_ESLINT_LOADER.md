# Security incident — obfuscated remote-code loader in `eslint.config.js`

Discovered 2026-09-18 during the Fantasy recovery pass, while investigating a
Prettier failure reported by `bun run lint`.

## What was found

- `eslint.config.js`, line 75, ended the legitimate `);` with about 500 spaces
  of padding followed by a 32 KB single-line obfuscated JavaScript payload
  (`global.i = 'A10-*41560'; const _0x32ebc7 = _0x5ce2; …`).
- Lines 7–9 added `import { createRequire } from 'module'` and a module-level
  `require`, which the payload needs to load `node:http`, `node:https`,
  `node:zlib`, `node:url` and `child_process`.
- Introduced by commit `9def3e1` ("fix: recover current football and news data
  with truthful fantasy availability", 2026-09-14, merged through PR #135). The
  commit touched 24 files; the `eslint.config.js` hunk was 6 lines and was easy
  to miss because the payload sits far to the right of the visible line.
- Static analysis only (the code was never executed deliberately): the payload
  reads `process.env.ETH_RPC_URL` plus a list of public Ethereum RPC endpoints
  and an indexer URL, binary-searches the nonce history of a hard-coded sender
  address (`eth_getTransactionCount`, `eth_getBlockByNumber`), extracts data
  from that sender's latest transaction, decodes it and passes it to `eval`,
  then `spawn`s a process. This is a blockchain-hosted second-stage loader;
  the second stage can change at any time and was not retrieved.

## Where it executed

ESLint evaluates its configuration file as a module, so the payload ran on
every `eslint` invocation between 2026-09-14 and the fix:

- the `application-quality` job of `.github/workflows/backend-quality.yml`
  (every pull request and protected-branch push). That job exposes only the
  default `GITHUB_TOKEN` with `contents: read`, no repository secrets;
- any developer machine, Lovable sandbox or agent session that ran
  `bun run lint`, including the session that found it (three runs before the
  cause was identified).

## Remediation applied

- Commit "security: remove obfuscated remote-code loader hidden in
  eslint.config.js" restores the legitimate configuration. `git grep` finds no
  other obfuscated code (`_0x…`, `createRequire`, `ETH_RPC_URL`) in tracked
  files; `package.json` has no install hooks.

## Owner actions required

1. Rotate every credential that was present in an environment where lint ran
   since 2026-09-14: GitHub personal/fine-grained tokens, `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `SPORTSMONKS_API_TOKEN`,
   `GNEWS_API_KEY`, `NEWS_INGESTION_TRIGGER_SECRET`, cloud provider keys and
   SSH keys on developer machines. Rotate Supabase service keys from the
   dashboard and update the GitHub Actions secrets afterwards.
2. Identify how commit `9def3e1` was produced (local machine, Lovable, an agent)
   and scan that environment; the padding technique targets code review, so
   treat the producing toolchain as compromised until proven otherwise.
3. Review the GitHub audit log for the repository and the account since
   2026-09-14 (new deploy keys, workflow changes, tokens, app installations).
4. Add a guard to CI: fail on any source line longer than, for example, 1 000
   characters outside generated files, and keep `bun run lint` after that check.
5. Merge the fix to `main` quickly; `main` still carries the payload and every
   CI run on it re-executes the loader.
