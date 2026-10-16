# Agent 5 — Visual design and typography audit

Read-only review of `/workspace/botolago-foundation`. No repository or database writes. AGENTS.md, CLAUDE.md, DESIGN.md and relevant DESIGN_SYSTEM_V2 sections inspected. Root remains sole writer.

## Evidence status

Source review complete. Rendered inspection pending the screen inventory agent's baseline captures. All recommendations below are SOURCE-ONLY until screenshot links and observations are appended. They do not claim a rendered defect or measured pixel saving.

## Preserve

- BotolaGO's existing floodlight navy, club-colour data edges/discs, white/light or slate/dark surfaces, one action gradient, stadium imagery, real standing tables and collectible manager cards.
- Changa 800 title voice; Manrope French / Noto Sans Arabic supporting text. Keep existing 34px hub, 22px section, 19px screen and 17px compact/team display hierarchy and 14/13px secondary/meta steps.
- Arabic taller leading and logical alignment. Never shrink Arabic text or its line heights to squeeze copy in. Never add Arabic tracking.
- 16px gutters, 44px control minimums, 48px data rows. Removal of explanation must not shrink hit areas or remove useful whitespace between different groups.
- Dynamic contextual metadata: actual season, age/competition scope, ranking count/filter state, current round, lock time, provisional status, points basis, prerequisites and irreversible consequences.

## Prioritized recommendations with local layout handling

| Surface and source | Candidate | Recommendation | Associated spacing change |
| --- | --- | --- | --- |
| `/fantasy/top-players`, `src/routes/fantasy.top-players.tsx:141` | `fantasy.top.subtitle`: “Les meilleurs joueurs de la journée selon leurs performances et leurs points Fantasy.” | Remove generic lead; if ranking basis is ambiguous retain only a precise “Classés par points Fantasy” near data/heading. | Following selector row has `mt-3`; remove that after deleting lead because enclosing `pt-4` already establishes the top gap. |
| `/fantasy/rules`, `src/routes/fantasy.rules.tsx:194` | Repeated h2 “Règles”, immediately after header h1 “Règles”; 61-word intro repeats squad, budget, XI, captain and deadline cards. | Remove duplicated heading and repeating intro, retain actual rule values/cards. If needed preserve one factual scoring sentence only. | Adjust first `dl.mt-4` after deleted content; preserve artwork and intentional separation, do not leave a blank heading-height placeholder. |
| `/profile/security`, `src/routes/profile.security.tsx:186` | `auth.mfa.subtitle`: generic extra-security benefit. | Remove; actual section title and enrollment instructions carry the task. Keep QR, authenticator, recovery and verification directions. | Every first branch starts `mt-5` (demo, loading, enrollment, error/enabled); remove/reduce first-block top margin after deleting lead. |
| `/auth/register`, `src/routes/auth.register.tsx:203` | “Rejoignez la communauté BotolaGO en moins d'une minute.” | Remove generic/unsupported speed promise. | Omit `subtitle` prop. AuthShell conditionally removes the paragraph and its `mt-1.5`; existing form `mt-6` can remain as title-to-form rhythm. |
| `/auth/update-password`, `src/routes/auth.update-password.tsx:130` | “Choisissez un mot de passe fort pour sécuriser votre compte.” | Remove generic imperative. Keep real password requirements adjacent to password field. | Omit normal-form subtitle only; preserve success/no-session subtitles conveying state. |
| `/notifications`, `src/routes/notifications.tsx:307` | “C’est ici que s’affichent vos notifications.” after “Rien de nouveau pour l'instant”. | Remove: describes the screen already identified by title. | Delete paragraph, not an empty string. Inspect illustration/card bottom balance after capture. |
| `/notifications` guest, `src/routes/notifications.tsx:88` | “Elles sont rattachées à votre compte BotolaGO.” after “Connectez-vous pour voir vos notifications”. | Remove account restatement; keep sign-in heading/actions. | Deleting paragraph retains existing `mt-5` action spacing; check card does not keep extra fixed height (none visible in source). |
| `/pepites/classement`, `src/components/pepites/PepitesRanking.tsx:217` | Desktop-only `pepites.ranking.desktop_lede`. | Assess removal against actual screenshot; previous line already contains U23, count and minimum minutes. Keep any unique metric definition. | The containing desktop block is `gap-1`; deleting paragraph removes its own gap automatically. Keep outer `gap-3` before filters. |
| `/pepites` footer, `src/components/pepites/PepitesHome.tsx:161` | `pepites.home.about` before method link. | Assess shortening to one metric/scope fact if unique; avoid repeating U23/competition already above. | Outer `gap-1` auto-closes. The method link has `-ms-3` to align its label; after removing paragraph, keep alignment to the update line/content gutter. |
| `/curva/carte`, translations `curva.card.intro`, `curva.card.tier_explain` | “Votre note vient de vos décisions, journée après journée.” / “Le palier suit votre note, journée après journée.” | Remove generic repeat when headings/stat values show the relationship. Keep forming and insufficient-data explanations. | Inspect actual rows/card spacing before changing; no broad shared primitive change. |

## Do not mistake essential support for filler

- Clubs title child at `src/routes/clubs.index.tsx:76` holds real competition and season, not a decorative description.
- Prospects “U23”, minimum minutes, season average, comparison scope, statistical unit, “minutes par demi-saison”, publication/freshness and data coverage define the data. These can often become concise metadata, but should not disappear.
- Pronostics progress/next lock at `src/components/predictions/PredictionsPage.tsx:202` is task-critical status. Preserve it. Storage-blocked/guest-save explanations tell the user whether picks persist.
- Fantasy draft guest note and sign-in-at-save fact are decision-relevant. Simplify but preserve both local persistence and when an account becomes necessary.
- Loading/error/not-found, permission/availability, legal, destructive confirmation and security enrollment help need precise state/recovery/consequences. Avoid generic wholesale `body` removal.
- Profile language help distinguishes this device's interface language from account notification-language preference. Preserve the distinction; copy may be shortened.

## Shared rendering behavior

- `UiPageTitle` only adds its `mt-3` children wrapper when children exist (`src/components/ui-kit/primitives.tsx:458`). Delete unused child nodes/props rather than leave empty wrappers.
- `AuthShell` supports optional `subtitle` and omits paragraph/margin naturally (`src/components/auth/AuthShell.tsx:210`). Prefer call-site changes; don't globally tighten form spacing.
- `UiStatePanel` supports optional body and only renders its `mt-1` paragraph when provided (`src/components/ui-kit/primitives.tsx:1271`). No global primitive rewrite is warranted for content cleanup.
- New copy should wrap naturally, particularly Arabic. Do not introduce truncation to hide a too-long translated explanation; write less text first.

## Acceptance checks for root

Use before/after on the same fixture, language, viewport and theme. Review 390x844 mobile and 1440px desktop, FR and AR. Check first useful data/control advances when text is removed; no empty paragraph/wrapper or detached block top-margin remains. At 320px and 200% text, title, control labels and statuses remain readable with no clipped meaning. Inspect element bounds rather than only document scroll width (overflow clipping can hide problems). Preserve important `aria-describedby`/dialog description relationships if associated text changes.

## Rendered evidence — initial capture blocker

Inspected actual [French mobile Home baseline](/tmp/botolago-screens/before/fr-mobile-home.png), development mock fixtures at 390px. A Vite error overlay obscures the upper screen: failed import `@capacitor/push-notifications` from `src/services/native-push-runtime.ts:36`. This screenshot is valid evidence of the runtime/setup blocker, but does not substantiate upper-screen copy/hierarchy claims. Root and capture agent notified; recapture required after dependency setup is repaired. Lower page shows News cards, real standings table and navigation tiles, but no full-screen visual judgment is made while the error overlay is present.

## Additional source findings

- BotolaGO+ `plus.rule` currently says “Votre note ne change jamais, seul le style change.” This can imply the manager rating never evolves. Rewrite as “Le style ne change pas votre note.” It is useful reassurance adjacent to style choices and becomes much shorter.
- Rated Curva card intro is inside `UiCard padding="none"`; the stat grid immediately below has `mt-2 border-t`. If removing only the rated intro, make grid top treatment conditional so no orphaned top gap/hairline remains. Preserve the forming-state intro (`cardIntroForming`) explaining why no rating is available.
- Existing `src/components/plus/plus.css:66` changes Arabic display size from 30px to 28px. This is a source-only inconsistency with the general “Arabic leading, not resizing” rule. Do not add further Arabic shrinkage to solve wordiness; assess the existing exception with actual Plus captures before broadening scope.

## Rendered evidence — clean Home baseline

Actually inspected these new development mock screenshots:

- [French mobile Home](/tmp/botolago-screens/baseline/fr-mobile-home.png)
- [French desktop Home](/tmp/botolago-screens/baseline/fr-desktop-home.png)
- [Capture labeled Arabic mobile Home](/tmp/botolago-screens/baseline/ar-mobile-home.png)
- [Capture labeled Arabic desktop Home](/tmp/botolago-screens/baseline/ar-desktop-home.png)

French Home: clean stadium/score hierarchy, concise news category/age metadata and compact real standings table are visually coherent. No broad copy-density or contrast change is warranted on those inspected blocks. The lower Fantasy summary is still a loading skeleton; its final layout is not verified. Desktop optional deadline/alerts differ across captures because loading has not settled, so before/after must use equivalent settled data.

**Language evidence failure:** the two files labeled Arabic visibly show French and LTR layout (FR switcher, “JOURNÉE 14”, French navigation); manifest records `lang=fr, dir=ltr`. They do not validate Arabic. Capture agent and root notified to wait for actual `documentElement.lang === 'ar'` and `dir === 'rtl'`, then recapture. This is a screenshot timing problem, not yet evidence of a product language-switch defect.

## Verified rendered audit (supersedes earlier capture attempts)

Only `/tmp/botolago-screens/verified/` is valid for baseline visual evidence. The capture agent now enforces actual FR/LTR or AR/RTL state. These are development mock fixtures, not production.

| Rendered screen | Actually viewed variants | Visual conclusion |
| --- | --- | --- |
| Home | [AR mobile](/tmp/botolago-screens/verified/ar-mobile-home.png), [AR desktop](/tmp/botolago-screens/verified/ar-desktop-home.png); earlier clean FR viewed as noted above | Core score, fixture and news hierarchy reads well. Keep actual deadline/status/news metadata. Arabic mirrors correctly in these captures. |
| Matches | [FR mobile](/tmp/botolago-screens/verified/fr-mobile-matches.png), [AR mobile](/tmp/botolago-screens/verified/ar-mobile-matches.png), [FR desktop](/tmp/botolago-screens/verified/fr-desktop-matches.png), [AR desktop](/tmp/botolago-screens/verified/ar-desktop-matches.png) | Lean title, tabs, date and fixture rows need no explanatory subtitle. Arabic mobile rail initially shows earlier dates while the selected Oct 16 is offscreen; flag as existing RTL rail behavior, outside supporting-copy scope. |
| Fantasy hub | [FR mobile](/tmp/botolago-screens/verified/fr-mobile-fantasy-hub.png), [AR mobile](/tmp/botolago-screens/verified/ar-mobile-fantasy-hub.png), [FR desktop](/tmp/botolago-screens/verified/fr-desktop-fantasy-hub.png), [AR desktop](/tmp/botolago-screens/verified/ar-desktop-fantasy-hub.png) | Strong opening deadline/team hierarchy. Below, cup block combines qualification state, redundant explanatory subheading and full knockout procedure. Shorten/move procedure to help; retain state and scoring facts wherever actually needed. Prospects shortcut description is longer than neighboring shortcuts; shorten to factual U23 scope. |
| Fantasy leagues | [FR mobile](/tmp/botolago-screens/verified/fr-mobile-fantasy-leagues.png), [AR mobile](/tmp/botolago-screens/verified/ar-mobile-fantasy-leagues.png), [FR desktop](/tmp/botolago-screens/verified/fr-desktop-fantasy-leagues.png), [AR desktop](/tmp/botolago-screens/verified/ar-desktop-fantasy-leagues.png) | Already purposeful with short actions, group headings and league ranks. Do not add a descriptive lead. Arabic dynamic Latin league names wrap naturally; preserve names. |
| Fantasy ranking | [FR mobile](/tmp/botolago-screens/verified/fr-mobile-fantasy-ranking.png), [AR mobile](/tmp/botolago-screens/verified/ar-mobile-fantasy-ranking.png), [AR desktop](/tmp/botolago-screens/verified/ar-desktop-fantasy-ranking.png) | Table, search and personal rank need no generic definition. Manager name plus team is useful row information. |
| Profile | [FR mobile](/tmp/botolago-screens/verified/fr-mobile-profile.png), [AR mobile](/tmp/botolago-screens/verified/ar-mobile-profile.png) | Language helper visibly takes several lines; preserve only device-versus-notification account distinction and destination. Deletion consequence is useful; preserve. Plus offer paragraph can become concise specific benefits. |
| Notifications ready | [FR mobile](/tmp/botolago-screens/verified/fr-mobile-notifications.png), [AR mobile](/tmp/botolago-screens/verified/ar-mobile-notifications.png) | Ready inbox is appropriately lean. The French content inside the Arabic card is mock notification payload, not evidence that translated UI labels failed. Empty/guest removal recommendations above remain source-only until those states render. |
| Prospects Top 10 | [FR mobile](/tmp/botolago-screens/verified/fr-mobile-pepites.png), [AR mobile](/tmp/botolago-screens/verified/ar-mobile-pepites.png), [FR desktop](/tmp/botolago-screens/verified/fr-desktop-pepites.png), [AR desktop](/tmp/botolago-screens/verified/ar-desktop-pepites.png) | Footer repeats U23/competition already in title metadata; shorten to the actual editorial-versus-score distinction. Weekly email body repeats the off switch state; remove “Désactivé tant que vous ne l'activez pas” and preserve frequency/content. Featured editorial lines summarize actual performance and should remain; repeated examples are mock fixtures and do not justify deleting live editorial content. Arabic title is longer but shows full week/scope; no font shrink recommended. |
| Pronostics ready | [FR mobile](/tmp/botolago-screens/verified/fr-mobile-pronostics.png), [AR mobile](/tmp/botolago-screens/verified/ar-mobile-pronostics.png) | Rules chips, remaining count and next lock all serve a task; preserve. No generic explanatory paragraph needed. AR compact progress fits one line here; FR wraps at a meaningful separator. |
| Plus offer | [FR mobile](/tmp/botolago-screens/verified/fr-mobile-plus-offer.png), [AR mobile](/tmp/botolago-screens/verified/ar-mobile-plus-offer.png) | Price, single payment and validity date are clear and decision-critical. Feature details communicate entitlements and should be shortened selectively without erasing scope. Fixed internal scrolling means full-page image does not expose every feature below the fold; full offer body not yet visually reviewed. |

No numerical contrast ratio or universal overflow pass is claimed: this lane viewed screenshots rather than raster contrast measurements or complete DOM bounds tests. Fixed navs obscure their normal slice in long full-page screenshots; this alone is not evidence of content being permanently inaccessible.

## Extended target validation

- Top players: actually viewed [FR mobile](/tmp/botolago-screens/verified-extended/fr-mobile-fantasy-top-players.png), [AR mobile](/tmp/botolago-screens/verified-extended/ar-mobile-fantasy-top-players.png), [FR desktop](/tmp/botolago-screens/verified-extended/fr-desktop-fantasy-top-players.png) and [AR desktop](/tmp/botolago-screens/verified-extended/ar-desktop-fantasy-top-players.png). The generic opening subtitle repeats the header and points story; FR mobile spends two lines on it. Confirm REMOVE or SHORTEN to a precise ranking basis, with selector margin cleanup. Useful player role, club, actual points/stat labels and gameweek selector stay.
- Rules: actually viewed [FR mobile](/tmp/botolago-screens/verified-extended/fr-mobile-fantasy-rules.png) and [AR mobile](/tmp/botolago-screens/verified-extended/ar-mobile-fantasy-rules.png). The second Rules heading and dense intro are visibly redundant above the value tiles and rule cards. Confirm removing duplicate heading and repeated introduction. Preserve illustration, actual card explanations, chips frequency, scoring table, tie-break and provisional/final policy; those have concrete functional meaning.

## Additional actual renders

- Curva card: viewed [FR mobile](/tmp/botolago-screens/verified/fr-mobile-curva-card.png) and [AR mobile](/tmp/botolago-screens/verified/ar-mobile-curva-card.png). Confirm REMOVE rated intro (“Votre note vient de vos décisions, journée après journée”) and generic tier-following line. Headings/stat tiles show the relationship. Keep next-tier numeric threshold, forming/no-rating reason, sample label and actual metric definitions. Card identity remains untouched.
- Curva home: viewed [AR mobile](/tmp/botolago-screens/verified/ar-mobile-curva.png). Score/card, club, season and current-round context are purposeful. [FR mobile](/tmp/botolago-screens/verified/fr-mobile-curva.png) is only a skeleton; it does not verify ready copy. Avoid comparing this loading shot to AR ready.
- Payment: viewed [FR mobile](/tmp/botolago-screens/verified/fr-mobile-plus-payment.png) and [AR mobile](/tmp/botolago-screens/verified/ar-mobile-plus-payment.png). Amount, transfer/deposit→receipt→verification sequence and where to put reference code all serve completion. Shorten footer reassurance about matching account only if preserving receipt+code association. Internal scroll limits which bank/Cash Plus conditions are seen.
- Briefing: viewed [FR mobile](/tmp/botolago-screens/verified/fr-mobile-briefing.png) and [AR mobile](/tmp/botolago-screens/verified/ar-mobile-briefing.png). Absences, unknown availability, free-transfer count and deadline are purposeful. The caveat that unknown availability does not imply availability must remain. Large horizontal scenario cards have a long dark minimum/stretch height in these full-page renders; this is an existing layout observation, not a reason to remove necessary instructions. No whole-briefing visual pass is claimed without inspecting each horizontally scrolled card.

## Onboarding and account extended renders

Actually viewed profile setup steps 1–3, FR/AR mobile: [FR profile](/tmp/botolago-screens/verified-extended/fr-mobile-setup-profile.png), [AR profile](/tmp/botolago-screens/verified-extended/ar-mobile-setup-profile.png), [FR club](/tmp/botolago-screens/verified-extended/fr-mobile-setup-club.png), [AR club](/tmp/botolago-screens/verified-extended/ar-mobile-setup-club.png), [FR notifications](/tmp/botolago-screens/verified-extended/fr-mobile-setup-notifications.png), [AR notifications](/tmp/botolago-screens/verified-extended/ar-mobile-setup-notifications.png). The same “Quelques choix rapides pour adapter BotolaGO à vos préférences” lead repeats “Personnalisez votre profil” on every step and takes two FR lines. Confirm REMOVE `auth.setup.subtitle` callsite prop. Keep step count, actual notification scope, favorite-club effect and account/device-language distinction. Removing this global lead improves first-control position without changing font sizes or form spacing.

Actually viewed [signed password update FR mobile](/tmp/botolago-screens/verified-extended/fr-mobile-signed-update-password.png). “Choisissez un mot de passe fort pour sécuriser votre compte” adds no requirements; confirm remove the normal form's subtitle, preserve validation/requirements and success/session states.

Actually viewed [forming card FR mobile](/tmp/botolago-screens/verified-extended/fr-mobile-curva-card-forming.png) and [forming card AR mobile](/tmp/botolago-screens/verified-extended/ar-mobile-curva-card-forming.png). No-rating explanation and remaining-sample threshold are essential. Preserve forming-state support even when removing rated-state repetition.
