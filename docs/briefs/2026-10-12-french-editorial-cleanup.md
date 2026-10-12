# French editorial cleanup

## Preserve
Routes, layout, styling, functionality, backend, data, authentication, game and scoring rules, timing, prices, rewards, legal rights, names, branding, translation keys and placeholders. Preserve Arabic and RTL behavior.

## Improve
Replace French reward « lot(s) » with « prix », with context-sensitive articles and agreement. Correct grammar, accents, agreement, English leakage, awkward phrasing and repeated terminology across French app copy. Keep existing forms of address coherent; use « tu » where the app already uses it, and neutral administrative text.

## Acceptance
Only copy values change in application files. No batch-related « lot » replacements. Locale keys and interpolation tokens remain identical. Existing relevant locale tests pass, and before/after French and Arabic desktop/mobile preview checks reveal no introduced clipping or RTL changes. No publication or database writes.

## Review constraints
Git branch, commits and pull requests are managed by the Lovable environment; this task does not issue stateful Git commands. The owner will inspect the completed diff before publishing.