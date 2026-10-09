# Automatic news stories verification

Before: live Home with section shortcuts, French mobile and Arabic desktop.
After: isolated actual components, eight FR/AR × 390/1440 × light/dark combinations.
The fixture image is a repository photo, not a generated output; it verifies the
layout, localized headline, source/AI attribution and viewer behavior without
spending provider credits. Live generated-image evidence is part of rollout.

`results.json`: measured 8px/12px rail gaps, 80px/96px item widths; no section links;
full localized headline; previous/next; Escape/focus return; hidden empty feed;
no page errors. `database.txt`: actual automation migration and lifecycle scenario
passed against isolated PostgreSQL with local Auth/storage table fixtures.

Relevant worker/repository/feature tests: 88 passed. UI-kit contract: 188 passed.
TypeScript and changed-source ESLint passed. The initial isolated browser run was
blocked by a shared Vite optimize cache; the committed preview now has its own
cache and all eight cases passed. No production data was used in these tests.
