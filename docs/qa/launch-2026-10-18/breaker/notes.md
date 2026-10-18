# Breaker baseline

Real Chromium, fresh isolated 1365×900 context, http://127.0.0.1:4173, production-configured development server. Root executed `/tmp/breaker-baseline.cjs` centrally because individual agent network approval calls stalled. I inspected the resulting screenshots and browser-observation JSON. No app files changed in this lane.

Steps: new visitor language chooser → double-click Continuer → double-click the first visible account action (Se connecter) → paste `junk@@@` and one-character password → double-click submit → browser Back → browser Forward.

Observed annoyance: **Back/Forward clears the non-secret email draft**. `05-junk-entered.png` and `06-junk-double-submit.png` show `junk@@@`; `08-forward-form.png` shows an empty email field after returning. Password clearance is not reported as a defect. Priority: low; one persona observed. The preceding page also changes from the newcomer landing to the regular Home view after Back (`07-back-mid-form.png`), which makes the original landing unavailable through that history entry; root can decide whether to include this as an orientation issue.

Passed: double clicks did not duplicate navigation or crash; invalid email and short password received clear French inline messages; no page errors or mutations occurred. The write guard blocked no requests in this run. Public read-only RPCs were explicitly allowlisted; other non-GET requests would have been blocked.

Environment observation: the initial `/` document responded 503, although hydration produced a usable landing and real match data. This is a response-status observation, not evidence of a visible failure; root should reproduce before attributing it to a product defect.

Boundary: no account was created; no production signup, authenticated team save, or mutation was attempted. The public Home reached on Back displayed the live Widad Témara 0–1 Kawkab Marrakech match and the upcoming 20:00 Wydad Casablanca–Amal Tiznit match. Account creation and authenticated first success remain unverified. A follow-up bounded script was prepared to follow the visible Créer un compte action, test signup validation/history, and open an actual public match detail.

## Signup continuation inspected

Root ran `/tmp/breaker-signup-baseline.cjs`. I inspected `signup-06-junk-double-submit.png`, `signup-08-forward-form.png`, and `signup-10-first-public-success.png` plus the full `signup-baseline.json`.

Confirmed the same issue on signup: **name, username, and email all disappear after browser Back then Forward**. Before: repeated HTML-like text and emoji in name/username and `junk@@@` email. After: all three non-secret fields empty. This is one issue across the login and signup forms, observed by this one persona; do not count the two forms as two users.

Signup validation passed: invalid username explains the 3–20 character/allowed-character rules; malformed email, short password, and unchecked terms each receive French inline errors. HTML-like text remains inert visible text; zero page errors, zero blocked writes, no request to create an account. Long full name acceptance was not classified as a defect without a product requirement. Double clicks did not cause duplicate navigation or crashes.

The continuation reached actual first public success by using browser Back to Home and double-clicking the visible live-match link: Widad Témara 0–1 Kawkab Marrakech, live at 53 minutes, goal by Saleh Al Sellami at 5 minutes, with lineups and substitutes. Screenshot `signup-10-first-public-success.png` proves the usable match information. Authenticated signup/team creation remains untested under the production-write boundary. Baseline did not include a terms detour; the after script adds that check explicitly.

`/tmp/breaker-after.cjs` repeats the journey in a fresh context and adds explicit checks: login email retained, login password cleared, signup name/username/email retained, signup passwords cleared, and email retained after a visible terms-link detour. It writes `after.json` and `after-*.png`. Root must execute it; preparation does not constitute a pass.

## After-fix rerun verified

Root centrally executed the retained `scripts/qa/launch-personas/breaker.cjs` against the changed app. I independently inspected `after.json` and the screenshots `after-login-restored.png`, `after-08-forward-form.png`, `after-terms-return.png`, and `after-10-first-public-success.png`.

All five explicit checks are true: login email restores after Back/Forward; login password clears; signup name, username, and email restore after Back/Forward; both signup password fields clear; signup email survives following the visible Conditions d'utilisation link and browser Back. The screenshots and field observations also confirm the name and username survive that terms detour. The draft-loss issue is fixed for the tested journey.

The rerun retained working inline validation for malformed email, an invalid long username, short passwords, and unchecked terms; HTML-like text stayed inert. Double-click navigation remained usable. Zero page errors and zero blocked mutation attempts were recorded. The write guard allowed explicit public reads only; no signup, login, database save, or other production write occurred.

First public success was reached again: actual live-match detail, Widad Témara 0–1 Kawkab Marrakech at 59 minutes, with the goal event and lineups. Authenticated signup/team creation remains outside this read-only QA boundary. The initial `/` document still returned 503 while the hydrated UI worked; that separate response-status finding remains for the lead to classify and resolve.
