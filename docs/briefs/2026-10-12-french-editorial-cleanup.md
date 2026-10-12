# French copy cleanup — 12 October 2026

## Preserve

BotolaGO branding, routes, layouts, Arabic and RTL, translation keys and placeholders, authentication and all Fantasy/scoring rules. Keep the established French « vous » voice, and « tu » only in messages shared between friends. Reward eligibility, deadlines, amounts and legal rights remain identical.

## Improvements

Replace French reward « lot » and « lots » with « prix », including displayed terms and privacy passages, with correct articles and agreement. Keep « lot » when it describes an operational batch. Correct grammar, inconsistent labels and literal English translations across the app. Shorten awkward or promotional wording into concrete, natural French.

## Inspection

Reviewed the existing French dictionary and hardcoded copy. The public /prizes screen displays « Lots à gagner », « Jouez gratuitement, gagnez des lots ! » and « Règlement des lots »; the navigation displays « Matches ». Both legal documents also contain reward references. Keep the present layouts and interactions.

## Acceptance

Only wording and existing text expectations change in application files. French and Arabic dictionary keys and interpolation/accent tokens remain unchanged. No backend or database writes. Reward references read « prix » in the shared French dictionary and French legal text; operational batch labels stay intact. Existing relevant locale, legal, admin and Fantasy checks pass. Inspect French and Arabic on desktop and mobile for clipping and direction changes. Prepare a draft pull request; no merge or publication before owner approval.
