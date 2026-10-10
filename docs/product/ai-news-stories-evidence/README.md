# Automatic news stories verification

Before: live Home with section shortcuts, French mobile and Arabic desktop.
After: isolated actual components, eight FR/AR × 390/1440 × light/dark combinations.
The fixture image is a repository photo, not a generated output; it verifies the
layout, localized headline, AI disclosure and viewer behavior without
spending provider credits. Live generated-image evidence is part of rollout.

`results.json`: measured 8px/12px rail gaps, 80px/96px item widths; no section links;
full localized headline; previous/next; Escape/focus return; hidden empty feed;
no page errors. `database.txt`: actual automation migration and lifecycle scenario
passed against isolated PostgreSQL with local Auth/storage table fixtures.

Relevant worker/repository/feature tests: 88 passed. UI-kit contract: 188 passed.
TypeScript and changed-source ESLint passed. The initial isolated browser run was
blocked by a shared Vite optimize cache; the committed preview now has its own
cache and all eight cases passed. No production data was used in these tests.

The full Home page also passed four FR/AR mobile/desktop checks against the local
backend stub. `home-spacing.json` records the measured separation from headlines
to the matchday banner (at least 20px). Main-page screenshots are `home-*.png`.
The first full-schema CI run rejected the article fixture's too-short body HTML;
the fixture now supplies valid rich-text bodies and uses the supported unlisted
visibility state to test withdrawal. A second full-schema run caught an unsupported media-kind value in the completion
RPC; it now uses the existing `article_hero` value, and the local fixture rejects
unsupported kinds too.

Production rehearsal of `apply-ai-home-stories.sql` passed and rolled back:
169 migration rows, 0 home stories, 85 media rows and 696 audit rows before/after;
no automation table remained. No active production-writing workflow, database
client or cron job was present at preflight. Persistent apply is still pending CI.

Review hardening: 16 worker tests pass with real RGB/RGBA PNG fixtures, CRC,
truncation, decompression length and scanline validation. Source publisher labels
are excluded from the public DTO; the database scenario asserts that boundary.
