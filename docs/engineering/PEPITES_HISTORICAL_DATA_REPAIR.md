# Pépites historical data repair — 2026-09-27

## Fresh evidence

[Provider-only diagnostic run 36328197922](https://github.com/mrdata007/botolago-foundation/actions/runs/36328197922)
ran against main `52ac516adc3925e5765bd573e9c31a691bc30c6d`.
Provider observations began at 2026-09-27 15:04:32 UTC; all 240 fixtures in
SportsMonks season 26027 (2025/26) were enumerated and classified.
Its 32 unit tests passed, 0 failed. The workflow succeeded in collecting
evidence; that success is **not** a complete-data or launch approval.

- 238 fixtures pass the existing identity-tolerant ingestion rules.
- 2 fail: 19596474 (Wydad–Tanger) and 19596475 (Fès–Safi), both 2 November 2025.
- The first has 7 anonymous starters and 5 anonymous substitutes.
- The second has 8 anonymous starters and 5 anonymous substitutes.
- All 25 anonymous rows have a team ID and at least one name/jersey hint.
  The aggregate report does not expose the hints, prove a unique match, or
  prove that those rows contain every required statistic.
- Only 176 fixtures have zero anonymous starters. The other 62 accepted
  fixtures have 1–4 anonymous starters (50 with 1, 11 with 2, 1 with 4).
  Passing the existing historical ingestion rule is not the same as having
  complete identified lineups. A Pépites launch review must acknowledge this.

## Recommended repair path

Recover and review player identities before changing the ranking formula:

1. Run the new **Pépites historical identity report (read only)** workflow
   against its exact reviewed main commit. It reads only fixtures 19596474
   and 19596475, exports allowlisted identity hints and payload fingerprints,
   and has no Supabase credentials or database calls. The artifact expires
   after seven days. Do not post provider credentials in chat.
2. Reconcile each anonymous row against the match-day team sheet and the
   canonical player catalog. Record fixture ID, lineup ID, team ID, source
   name/jersey, proposed canonical ID, corroborating source and reviewer.
   A shirt number alone, a fuzzy name match, or today's squad membership is
   insufficient evidence. Leave ambiguity unresolved.
3. Prefer provider corrections. Otherwise prepare a bounded, provenance-bearing
   manual overlay as a separate reviewed change. Never overwrite the original
   provider payload or invent a provider player ID. A mapping alone must not
   mark statistics complete. Check actual supplied minutes, events and rating
   coverage after mapping; unknown optional values remain unknown.
4. Run the reconciled payloads through the existing validations on an isolated
   local database; verify both teams, starters, substitutes, event/score
   consistency, duplicates and all mandatory fields. Compare Pépites rankings,
   eligibility around 600 minutes, Stats and replay results before/after.
5. Review the 62 accepted fixtures with anonymous starters as a separate
   completeness issue. Do not claim that repairing two fixtures establishes
   complete season coverage.
6. Seek separate approval for the exact production data write. Acquire the
   single-writer window required by AGENTS.md, preserve baseline evidence,
   apply only the reviewed fixture overlay, and remeasure coverage.
7. Generate a new frozen historical run for staff review. Public activation
   remains a separate decision.

## Current execution boundary

The protected `production-football-ingestion` environment permits only `main`.
The existing main diagnostic was run; the new identity extractor has **not**
been run against the live provider. Its workflow must first be reviewed and
merged by the owner, or the owner can run the script in an approved runtime
with the existing credential injected securely:

```sh
PEPITES_IDENTITY_REPORT_DIR=/absolute/private/output-directory \
  bun scripts/backend/pepites-historical-identity-report.ts
```

The script expects `SPORTSMONKS_API_TOKEN` in that runtime's environment. It
refuses to overwrite an existing report and writes mode 0600. No token value
belongs in the command, repository, or report.

No production write, public activation, history rewrite, environment-policy
change or merge is included in this preparation.

## Ranking alternative (requires methodology decision)

If identities cannot be recovered, prepare a new versioned methodology for a
clearly labelled provisional ranking using explicitly defined usable matches.
Do not silently alter frozen v1, lower the 600-minute floor, or call unknown
minutes zero. Define treatment of partially identified fixtures, transferred
players, denominator coverage, season midpoint and minimum sample size before
implementation. Preserve old-run replay and expose coverage in the UI.

Owner decision requested; no new methodology has been implemented.

## Checks run for this preparation

- Local report + existing provider probe unit suites: **43 passed, 0 failed**.
- ESLint on the new report and tests: passed after correcting one lint error.
- `actionlint .github/workflows/pepites-historical-identity-report.yml`: passed.
- No database tests or browser tests were needed or run for this read-only
  tooling change; no application or database behavior was changed.

## Secondary research (not import evidence)

- [Eurosport Fès–Safi match sheet](https://www.eurosport.fr/football/botola/2025-2026/live-maghreb-de-fes-oc-safi_mtc1634530/live-lineup.shtml)
- [PlayerStats Fès–Safi](https://playerstats.football/fixture/maghreb-fes/olympic-safi/2025-11-02)
- [Transfermarkt Wydad–Tanger](https://www.transfermarkt.com/spielbericht/index/spielbericht/4758562)

The accessible Fès–Safi sources disagree on some event times. Transfermarkt
returned a verification page. These sources were not imported as player stats.
