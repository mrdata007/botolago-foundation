# Verification — private match visuals

Local feature branch: `feat/precise-match-visuals`.

- 55 relevant Bun tests passed: masked source preservation, image worker and
  existing Home Stories regression coverage, private HTTP imports/access limits,
  collector token/pause/deduplication, and repository response boundaries.
- App TypeScript and strict shared worker/collector/adapter TypeScript passed.
- Targeted ESLint passed; 201 migrations validated; configuration guard checked
  70 files without violations. Secret scan found no high-confidence secrets.
- Real components and production CSS were checked with fixture repositories at
  390px and 1440px in French and Arabic. Import, edit, hold and discard passed;
  read-only, empty and error states passed. No child bounding box escaped the
  viewport. Private queue contains no Publish button even for publishers.
- Official BotolaGO vector branding was rendered by the real browser helper:
  resulting PNG has no nontransparent pixels outside the selected rectangle.
- Before/after screenshots were captured. The before images render the exact
  pre-interface component from commit `cac6625e`; after images include the
  private queue. Browser outputs are fixture evidence, not real account data.
  Reproduce current checks with `node tests/visual-drafts/run.mjs`; the report and
  screenshots are under `test-results/match-visual-drafts/`.
- The real migration compiled and its 12 pgTAP scenarios passed in a disposable
  embedded PostgreSQL harness. Supporting tables and staff authorization were
  minimal stubs; the real service-role check and editorial audit routine were
  used. Each run used its own database, with no concurrent writer or schedules.
  Public story/media counts and all article hero IDs were compared before and
  after private completion, cancellation and failure scenarios.
- Migration history was read in production and staging: this migration was
  absent before it was rewritten for private holds. Neither database was written.

Full Supabase database-quality CI and exact generated type parity remain pending.
The local full Supabase attempt could not initialize its Docker image because
of the Docker VFS storage limit. No real image-provider edit was run, no source
feed connected, no production storage or cron changes made, and no deployment
performed. Collection defaults off in the migration. These limits must remain
visible in the review; supplementary PostgreSQL and fixture browser checks do
not establish a live provider/Storage end-to-end result.

## CI integration follow-up (2026-10-15)

The first full CI found missing release-runbook accounting and missing named
staff-RPC registrations in the MFA audit. Both are corrected, with the audit
and owner-run postflight kept identical. Added five negative audit probes (one
per endpoint) and four further real staff-denial assertions. No migration or
runtime permission guard was weakened or changed.

After synchronizing current main, the full local Bun suite passed: 9,561 tests,
23 skips, no failures. The 98 targeted workflow/release/security tests passed.
App TypeScript and repository ESLint passed (37 existing warnings, no errors),
and 229 migrations validated. Full Supabase CI is the authority for the new
58-case MFA suite, 16-case private-visual suite and generated type parity.

The independent smoke-test checker was exercised on synthetic PNGs: an edit
inside the rectangle passed with zero changed protected pixels; a deliberately
changed outside pixel exited nonzero. The real-photo test is prepared in
`private-smoke-test.md`; it has not been run or deployed. Collection remains off.
