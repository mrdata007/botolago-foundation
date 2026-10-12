# French editorial cleanup

## Preserve
Routes, layout, styling, functionality, backend, data, authentication, game and scoring rules, timing, prices, rewards, legal rights, names, branding, translation keys and placeholders. Preserve Arabic and RTL behavior.

## Improve
Replace French reward « lot(s) » with « prix », with context-sensitive articles and agreement. Correct grammar, accents, agreement, English leakage, awkward phrasing and repeated terminology across French app copy. French UI uses « vous »; « tu » is reserved for friend-to-friend share/invite messages. Keep neutral administrative text and the names Joker, Triple Capitaine, Free Hit and Bench Boost.

Final owner authorization, 2026-10-12: apply terminology-only lot/lots → prix replacements in the French displayed legal documents despite the older generated-source warning, with a dated source comment. Preserve every other clause, version/date, identity, eligibility, deadline, retention term and Arabic text. Use the neutral starting-eleven points label and the owner's exact prize introduction and eligibility confirmation; no calculation changes.

## Acceptance
Only copy values change in application files. No batch-related « lot » replacements. Locale keys and interpolation tokens remain identical. Existing relevant locale tests pass, and before/after French and Arabic desktop/mobile preview checks reveal no introduced clipping or RTL changes. No publication or database writes.

## Review constraints
Git branch, commits and pull requests are managed by the Lovable environment; this task does not issue stateful Git commands. The owner will inspect the completed diff before publishing.