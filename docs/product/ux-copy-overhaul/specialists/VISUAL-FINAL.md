# BotolaGO visual verification — matched before/after

## Outcome

48 matched pairs (96 accepted before/after renders) plus 8 after-only narrow/dark checks. Complete requested 12-screen matrix.

The inspected changes preserve BotolaGO’s type, colours, card identity and functional facts. Removing generic introductions advances the first useful controls/data. No new text clipping or text outside the viewport was found in the measured candidates; deliberate horizontal rails are recorded separately. This is a scoped visual result, not a claim that every accessibility criterion was tested.

## Evidence and capture method

- [Final manifest](/tmp/botolago-comparisons/manifest.json) contains exact route/query, identity, real timestamp, screenshot paths, complete DOM text, language checks, viewport alignment and measurements.
- [Position/bounds measurements](/tmp/botolago-comparisons/measurements.csv) provide per-variant first-data coordinates and candidate counts.
- Frozen baseline localhost4174 versus current localhost4173, isolated Vite caches. Source stayed frozen during each accepted capture batch. After the main matrix, one final Saved-only dictionary correction removed a repeated empty-state sentence; only its four after images were refreshed. All other screenshots remain unchanged. The separate standalone fallback CSS check belongs to root’s evidence.
- Every route/language/viewport/phase used a fresh context. Synthetic development mock account or guest, explicit `mc=rated`, `plus=none` (briefing `plus=season`), step5 payment and step3 setup. This avoids fixture state carrying between routes.
- Main matrix uses light theme at390×844 and1440×1000 in FR/LTR and AR/RTL. Additional checks: registration/payment at320×700 FR+AR; Rules/Card at390×844 dark FR+AR.
- Real browser clock; UTC timestamps saved, timezone Asia/Dubai. Countdown minutes may differ between adjacent pairs. Fixed-clock emulation was dropped after hydration failures.
- Exact DOM lang/dir and visible Arabic h1 checked immediately before and after image capture, with final metadata gated again. Route-specific loaded elements, fonts and images waited for.
- Explicit scroll reset before full-page and viewport screenshots; viewport screenshots assert scrollY0. First-data coordinates use document position (`rect.top + scrollY`). Only captureVersion2 without viewportCorrectionPending is final evidence.

## Measured first-data improvement on mobile

| Screen | First useful element | FR advance | AR advance |
| --- | --- | ---: | ---: |
| register | First name field | 49.38px | 32.59px |
| top-players | Featured player card | 55.38px | 38.59px |
| rules | Rules value tiles | 177.62px | 169.27px |
| setup-step3 | First notification checkbox | 49.38px | 32.59px |
| curva-card | Rating statistic grid | 67.38px | 50.59px |
| notifications-guest | Registration action | 25.69px | 30.59px |

## Representative comparisons

Each family has both languages and both widths in the manifest. These eight pairs are suitable for committed visual evidence; the full set remains available externally.

| Screen | Before | After |
| --- | --- | --- |
| register (ar) | [Before](/tmp/botolago-comparisons/ar-mobile-register-before.png) | [After](/tmp/botolago-comparisons/ar-mobile-register-after.png) |
| top-players (fr) | [Before](/tmp/botolago-comparisons/fr-mobile-top-players-before.png) | [After](/tmp/botolago-comparisons/fr-mobile-top-players-after.png) |
| rules (ar) | [Before](/tmp/botolago-comparisons/ar-mobile-rules-before.png) | [After](/tmp/botolago-comparisons/ar-mobile-rules-after.png) |
| setup-step3 (fr) | [Before](/tmp/botolago-comparisons/fr-mobile-setup-step3-before.png) | [After](/tmp/botolago-comparisons/fr-mobile-setup-step3-after.png) |
| curva-card (ar) | [Before](/tmp/botolago-comparisons/ar-mobile-curva-card-before.png) | [After](/tmp/botolago-comparisons/ar-mobile-curva-card-after.png) |
| plus-payment (fr) | [Before](/tmp/botolago-comparisons/fr-mobile-plus-payment-before.png) | [After](/tmp/botolago-comparisons/fr-mobile-plus-payment-after.png) |
| plus-offer (ar) | [Before](/tmp/botolago-comparisons/ar-mobile-plus-offer-before.png) | [After](/tmp/botolago-comparisons/ar-mobile-plus-offer-after.png) |
| briefing (fr) | [Before](/tmp/botolago-comparisons/fr-mobile-briefing-before.png) | [After](/tmp/botolago-comparisons/fr-mobile-briefing-after.png) |

## Inspected visual findings

- Registration, Top players, Rules and setup: redundant introductions disappear with their spacing. Titles retain the Changa voice, controls retain clear separation, and AR preserves taller leading and natural wrapping. Rules cards/scoring details remain.
- Curva Card: rated-state generic introduction and tier-following sentence disappear. Statistic definitions and next-tier threshold remain. Existing locked premium previews make the page long, especially its desktop column; this is present in the frozen baseline.
- Payment/offer: payment method, amount, single payment, period end, reference code, bank/Cash Plus details and verification condition remain. Shorter footer instructs attaching receipt; RIB copy value is untouched. Existing RIB line wrapping is visible in both phases and is not character loss.
- Briefing: “reported absence” wording and shorter uncertainty caveat remain distinct from confirmed availability. The large dark horizontal deck and desktop heading wrapping predate this change. Initial deck positions were captured; this does not claim every offscreen card was visually reviewed.
- Profile: device language versus account notification language remains clear with fewer words. Guest notification gate is shorter without losing its required action. Prospects footer keeps editorial selection versus statistical classification, while weekly email copy keeps cadence/content.
- Saved articles guest: NEWS mock mode uses the local empty collection even for anonymous readers. The actual observed empty state is captured. Final review removed its repeated no-articles sentence and retained only the concrete bookmark instruction; all four Saved after variants were refreshed. The production-only sign-in gate was reviewed in source, not falsely presented as an actual guest render.

## Bounds and limitations

Final candidate-bearing captures: 0. No offscreen/clipped text candidates in the measured elements.

All images are development mock fixtures, not production. This lane made no repository/database edits. No payment execution, real authentication, backend behavior or numerical contrast ratio is claimed. Fixed navigation can cover its usual viewport slice in a long screenshot; the full-page artifact alone does not establish inaccessible content. Horizontal decks and internal offer/payment scrolling are deliberate; payment/offer include lower-scroller captures. Initial French/LTR images mislabeled Arabic, interrupted writes and provisional viewport frames were rejected and superseded by final version2 evidence.
