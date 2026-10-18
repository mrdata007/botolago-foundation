# Mobile first-time user

Real headless Chromium, isolated context, French locale, mobile touch, 375 × 812 CSS pixels. CDP slow 3G: latency 2,000 ms, download 50,000 bytes/s, upload 50,000 bytes/s. Production build served locally at http://127.0.0.1:4173 with real public backend reads. Browser certificate errors are ignored for the sandbox's TLS interception. No backend response mocking and no account/database writes.

## Result: first public success reached after fix

| Stage | Before | After |
| --- | --- | --- |
| Language choice captured | 73.9 s | 74.0 s |
| Four seconds after Continuer | Blank navy screen at 77.9 s | Brand, “Chargement…” and “Voir les matchs et résultats” at 78.2 s |
| First real score read | Not reached within the 88.0 s run | WID 0–1 KAW, 60′ at 83.3 s |
| Follow scored match | Unavailable | Detail URL reached at 88.6 s; detail still loading |

First success means reading an actual football score through visible UI without signup: the after screenshot shows WID 0–1 KAW, 60′. The accessible label confirms “Score : Widad Témara 0, Kawkab Marrakech 1 — 60′”. The scored chip leads to `/matches/e3ee8a8a-f568-4cf2-ae9a-a21c409be5f5`. The final detail screenshot contains loading skeletons, so this evidence does **not** establish a fully loaded match-detail page.

## Issue M1 — blank screen after language choice on slow 3G

Observed by this persona: 1. Baseline severity: blocker in the measured journey. Status: fixed for reaching first public success.

Before: after Continuer the screen has no visible text, links, buttons, loading message, or retry action at the four-second sample. Matchs navigation remains unavailable through a further ten-second wait. Screenshot `before-02-landing.png`.

After: the same stage displays the brand, “Chargement…” and an explicit public route, “Voir les matchs et résultats”. Its measured target is 201.4 × 44 px and sits within the 375 px viewport. Clicking it reaches the actual live score in the match list. Screenshots `after-02-landing.png`, `after-03-match-list.png`.

## Layout and runtime checks

The language chooser controls and recovery link fit the viewport. Header controls measure 44 × 44 px; bottom navigation items measure approximately 72 × 59 px. Element bounding boxes were measured directly. Offscreen dates in the match calendar belong to its intentional horizontal scroller; those bounds alone are not a page overflow defect. Screenshots show readable date navigation and score without horizontal page displacement.

Neither production run records a page JavaScript exception. Both record three aborted backend requests; that observation alone does not establish their cause.

## Remaining measurement limits

Initial load is still slow in this local uncompressed Node serving harness: the language chooser is captured around 74 seconds on the configured slow 3G connection in both runs. The fix adds usable feedback and a public path while the landing chunk loads; it does not demonstrate a reduction in the initial JavaScript download. A deployed CDN/compression performance check remains necessary before claiming production load-time improvement.

The match list still contains loading skeletons beneath the live-score chip at the sampled stage, and the detail page is still loading at the final sample. First public score success is proven; complete detail load, account creation and authenticated Fantasy success are not covered by this persona run.

## Evidence

`before-production.json` and `after-production.json` contain exact timings, DOM text, controls and bounds. Screenshots carry `before-` / `after-` prefixes. The JSON script's `successDefinition` describes detail navigation too broadly; the inspected screenshots support the narrower first-score success described above.

`baseline.json`, `before-01-10seconds.png`, and `before-02-25seconds.png` are superseded development-server setup evidence. They must not be used as production timing evidence. The setup script's generic CTA text search did not match home navigation; that script limitation is not an app defect.
