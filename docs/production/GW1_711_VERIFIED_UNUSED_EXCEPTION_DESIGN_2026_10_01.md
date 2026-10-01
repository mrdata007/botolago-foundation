# Leaving out an owner-approved, verified-unused, unplaceable substitute (design v2, 1 Oct 2026)

**Status: designed and implemented locally. Not applied, not deployed, not merged. Nothing
here has run in production.** This replaces the first draft (commit `fa389697`), which had
four defects recorded in `GW1_711_PARTICIPATION_DIAGNOSTICS_2026_10_01.md` (A to D). Each is
answered below.

Target: SportsMonks player 38227322 (Soufane Abderrahmane), substitute for CR Khemis
Zemamra in fixture 19874711.

## 1. Evidence it rests on

Read-only diagnose run 36870906327 (main `060d9ba3`, fixture 19874711 only): role
substitute; official minutes none sent; no scoring-relevant statistic with a value; no
unknown statistic; no match event names him. The provider sent no statistic rows for him at
all, so the zeros are the provider's "absent means zero" rule, not explicit zeros. The same
payload's events do name other players, so his empty list is meaningful. Six other
substitutes have the same empty record, which is why scope cannot be "whoever is unused".

## 2. Why 711 is blocked

`api.ingest_current_player_fixture_performance` raises `PLAYER_MAPPING_NOT_FOUND` for any
named lineup player with no canonical player. A canonical player needs a real position, the
provider gives him none, and the one fixture is one transaction, so he blocks all 39 players
though he cannot change a point.

## 3. The answer to the four defects

**A. The limit belongs on the approved list.** The first draft returned no declarations when
more than two substitutes were unused. Now the limit is 2 on the owner-approved list (the
allowlist, and the declaration the database receives). How many other substitutes happened to
be unused is never counted. Tested in both languages: eight unused substitutes, one approved,
the one is left out and the other seven are imported as before.

**B. Scope is explicit and owner-reviewed.**

- The scope is `scripts/backend/verified-unused-exceptions.json`, a file in the repository.
  Each entry is an exact fixture id plus an exact provider player id, so every change is a
  reviewed commit, and a run only sees the entries of the exact commit it was dispatched at.
- An entry is `proposed` or `approved`. Only `approved` is honoured, and an approved entry
  names an approver and a date. At most 2 entries per fixture, no duplicates, strict shape.
- The importer reads the file only on a one-fixture run (`only_fixture_external_id`). A page
  or an orchestrator pass never reads it, so it cannot change them.
- Nobody is discovered at run time. A player not listed is never left out, whatever the
  provider says. The provider's facts must also independently show him unused, checked in
  the importer and again in the database.
- The first-use entry is committed as **proposed**: fixture 19874711, player 38227322. The
  owner flips it to approved (with name and date) in a reviewed commit.
- If an approved entry no longer holds (the provider now shows minutes or an event, he is
  not in the lineup, or the preflight record changed) the fixture is **not ingested** and
  the evidence says why. It does not fall back to ingesting him.

**C. "No provider mapping" is not "no canonical or Fantasy record".**

- What the database can check is checked: no provider mapping of any kind (active or not) for
  his id, his club is one of the fixture's two clubs, the gameweek is not under adaptive
  scoring, the starters in the rows are the starters the coverage reports and no club has
  more than 11.
- What it cannot check is a **reviewed claim**, not a proof: that no canonical player, Fantasy
  player, squad membership or locked lineup represents the same real person under another
  id. It is recorded in a preflight record
  (`GW1_711_38227322_UNUSED_PREFLIGHT_2026_10_01.md`) with read-only SQL for the owner to run
  and a table for the owner to fill in. Each allowlist entry pins that file's sha256; a
  changed file is refused until re-reviewed. The file's digest is stored with each exclusion.
- The preflight record is **not yet owner-reviewed**. Every check in it reads "not yet
  confirmed".

**D. Event verification is described truthfully.**

- The database cannot see the provider payload. That he had no minutes, statistic or match
  event is **trusted importer evidence**, not independently verified by the database.
- It is carried through a contract the database validates for form and consistency: the
  declaration must carry empty lists for scoring statistics, unknown statistics and match
  events, plus a SHA-256 of exactly those facts in a fixed text form. The database recomputes
  that digest and refuses a declaration that does not match. The same digest is stored in the
  audit row with `evidence_basis = importer_declared_digest_bound`, so what the exception
  rested on is auditable later. A cross-language test vector keeps the TypeScript and SQL
  digests identical.

## 4. What it does, step by step

1. The importer reads the provider payload, builds the per-player facts (as in the merged
   diagnostics) and, on a one-fixture run, checks each allowlist entry for that fixture.
2. For each approved entry whose facts still show an unused substitute, it adds a declaration
   to `p_coverage.verifiedUnusedSubstitutes`. Rows and every other coverage field are
   untouched. A fixture with no approved entry sends exactly the call it always did.
3. The new database wrapper (in front of the renamed existing function) refuses a malformed
   declaration (`INVALID_PROVIDER_PAYLOAD`), checks the facts above, and if any precondition
   fails raises `VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED` (SQLSTATE 55000) and writes
   nothing.
4. If all hold it removes his row, moves him from the valid rows to the rows left out in the
   coverage (rows seen unchanged), calls the existing function unchanged, then records him in
   `app_private.current_fixture_excluded_participants` bound to the coverage's source version.
5. The result lists the ids left out. The importer requires exactly the declared set and a
   row count lowered by the same number; anything else is a reconciliation failure.

Unchanged: starters, mapped players (known substitutes are imported as before), goalkeeper
checks, statistics completeness, the 11 starters per side, goal reconciliation, the
scoring document and every digest for every other fixture.

## 5. Audit representation

`app_private.current_fixture_excluded_participants` (append-only, service role only, RLS
forced), one row per left-out player per coverage version: provider player and club, role
`substitute`, reason `verified_unused_unmapped`, official minutes, zero-statistic types, event
types (always empty), `evidence_basis`, `evidence_digest`, `preflight_digest`, the provider's
observed time. The view `current_fixture_verified_unused_participants` joins it to the
fixture's current coverage row. "Left out on purpose and verified" is a stored fact;
"unknown" is never recorded this way.

## 6. Why GW1 points cannot change

The scoring document is built from Fantasy players joined to performance rows. A player with
no Fantasy player has no scoring row either way, and the exclusion requires that no mapping
exists. A missing performance row scores as did-not-play with zero statistics, the same as
the all-zero row he would otherwise have. The local test builds the scoring document after
an exclusion and checks it validates, has no new key (every other fixture's digest is
unchanged) and has one row per Fantasy player of the two clubs. Fixtures 705 and 708 are not
touched: they never carry a declaration.

## 7. Local validation

Disposable Postgres 16 with Supabase stand-ins, not the CI stack. CI's `database-quality` job
is the authority; Docker was not available here.

- **Database:** `current_performance_verified_unused_unmapped.test.sql`, 85 pgTAP tests, all
  passing. Cases: PASS A; REFUSE B (starter, alone and with minutes), C (minutes, alone and
  with appeared), D goal, E assist, F yellow, G red, G2 second yellow, H own goal, I missed
  penalty, saved penalty and save, goals conceded, null saves, null saved penalties, rating,
  clean sheet, wrong club, malformed declarations, duplicates; the new contract (wrong
  fixture, event named, missing or wrong evidence digest, missing preflight digest, more
  than 2 declared, an unapproved third unknown substitute still blocks); J held by a Fantasy
  team, K in a locked lineup, L known player (refused when declared, existing refusal
  unchanged when not); M unnamed row; adaptive scoring; a missing starter and a club with 12
  starters; eight unused substitutes with one approved; privileges; idempotent repeat;
  unchanged digest for a fixture that excludes nobody; scoring-document shape.
- **Database negative controls:** 35 mutations of the migration, each rebuilt from scratch.
  Each makes at least one test fail. Two controls first passed silently (a redundant digest
  format check and a NULL comparison that would have skipped a missing digest); the second was
  a real gap, now fixed with `IS DISTINCT FROM` and a test.
- **Existing database suite:** 110 files, 2,714 tests, against a baseline of 109 files and
  2,629 tests before this work. The same 27 files fail before and after, all for limits of the
  local stand-in (for example a missing `mfa_factors` column); none is related.
- **TypeScript:** `current-season-performances.test.ts` and
  `verified-unused-exceptions.test.ts`, 117 tests passing; the whole `scripts/backend` and
  `src/backend` suite, 1,221 passing, 0 failing. 17 mutations of the importer and the
  allowlist module all fail tests.
- **Normal path unchanged:** main's importer and this one were run side by side on 80
  combinations (two fixtures, four payload shapes, adaptive on and off, five run modes). Every
  RPC call and argument is identical; results are byte-identical in ingest modes, and diagnose
  differs only by the new `verifiedUnusedScope` report.
- Typecheck, ESLint, Prettier, secret scan and migration check are clean.

## 8. Remaining risks

- A player the provider shows as unused who in fact played, with no minutes and no event,
  would be left out; no Fantasy points are lost (no Fantasy player), but his real minutes are
  not recorded. Mitigations: at most 2, named by owner, digest-bound evidence, one fixture.
- The preflight claim about the same real person is human-reviewed, not machine-verified.
- Adaptive scoring is refused, not supported.
- The migration must be applied before an approved entry is used.

## 9. Approvals still needed (each separate; none is given by this document)

1. Review and merge of this patch (migration, importer, tests, allowlist, preflight record).
2. The owner runs the preflight checks, fills in the record, and flips the entry to approved
   in a reviewed commit (which also updates the pinned digest of the record).
3. Applying migration `20261001130000` through the reviewed migration path.
4. A fresh scoped Observe, one rolled-back rehearsal of the other 11 identity repairs, then
   one canary ingest of fixture 19874711 with the approved entry.
