# Launch QA — five first-time-user personas

Three confirmed product issues were repaired in one implementation pass. All five persona reruns reached a real public match score; four also verified the rendered match detail. This is a public-entry-flow result, **not a full signup or Fantasy activation sign-off**.

## Ranked findings

Counts are distinct agent personas that actually encountered the issue, not extrapolated user impact. Ties are ordered by obstruction.

| Rank | Finding | Personas | Before evidence | Repair and rerun evidence |
| --- | --- | --- | --- | --- |
| 1 | Reading a policy or using Back/Forward erases login email and registration name, username and email. | **2/5** — skeptic, breaker | [Skeptic detour](skeptic/detour-baseline.json), [breaker baseline](breaker/signup-baseline.json) | Session-only drafts retain those fields for up to 30 minutes and clear on successful authentication/registration. Passwords and consent are never persisted. [Skeptic assertions](skeptic/after/rerun.json), [breaker five checks](breaker/after.json) all pass. |
| 2 | After choosing a language on slow 3G, a pending landing chunk leaves an entirely blank navy screen with no action or explanation. | **1/5** — mobile | [Blank screen](mobile/before-02-landing.png), [production baseline](mobile/before-production.json) | A branded, announced loading message and translated, 44px match-results link replace the empty fallback. [After screenshot](mobile/after-02-landing.png), [successful production rerun](mobile/after-production.json). |
| 3 | No direct Terms or Privacy links on the landing page; a cautious visitor has to discover them through the auth flow. | **1/5** — skeptic | [Full landing without links](skeptic/04-terms-not-found.png) | Both existing policy pages are linked in the final invitation, in French and Arabic. Visiting them preserves the first-visit landing when returning. [After footer](skeptic/after/01-landing-legal.png), [policy/detour checks](skeptic/after/rerun.json). |

Pricing is clearly disclosed as free. Junk input produces validation messages; repeated clicks did not crash or bypass validation. No independent language or RTL defect was demonstrated. Closed Fantasy entry is an authoritative current-round rule, not a defect.

## Rerun outcomes

| Persona | Outcome | What was proved |
| --- | --- | --- |
| Impatient | PASS | First primary CTA explains the closed round; visible Matchs navigation reaches live score and rendered detail. [Independent review](impatient/README.md), [trace](impatient/after.json). |
| Skeptic | PASS | Reads both policies from landing; registration fields survive both same-tab detours; consent stays unchecked and passwords empty; reads actual score and detail. [Review](skeptic/README.md), [assertions](skeptic/after/rerun.json). |
| Mobile, 375×812, slow 3G | PASS for first public score | Loading recovery is visible and usable. Real Widad Témara **0–1** Kawkab Marrakech score appears at 83.3s; detail URL opens at 88.6s, but detail content is still loading. [Review](mobile/README.md), [timed trace](mobile/after-production.json). |
| Literal language | PASS | Follows the exact French and Arabic labels through the closed-round explanation, calendar and rendered live match detail. Arabic remains RTL. [Review](literal/README.md), [French trace](literal/after/observations.json), [Arabic trace](literal/after/arabic/observations.json). |
| Breaker | PASS | Malformed inputs, HTML-like junk, double clicks and history navigation stay usable. All five draft/password checks pass, a terms detour preserves the draft, and real match detail is reached. No mutations were attempted. [Review](breaker/notes.md), [checks](breaker/after.json). |

The live match remained Widad Témara 0–1 Kawkab Marrakech during these checks; its clock advanced between independently captured runs.

## Ordered journey and health

1. **Open the app / choose language — functional, slow cold-load caveat.** French and Arabic choices work. The local slow-3G harness took about 74s to display the chooser.
2. **Understand the landing / price / policies — repaired.** Free play is disclosed; both policy links are directly discoverable and usable.
3. **Follow the primary Fantasy action — functional current-state boundary.** The round is closed and the hub explains why, with public alternatives. No rule was bypassed to create a team.
4. **Inspect signup / validate junk / read policies / use history — repaired.** Non-secret fields survive detours; invalid input remains rejected, passwords clear and consent is not restored. No real account was submitted.
5. **Use the public match-results path — functional.** Every persona reads a real score through visible controls. Mobile's new loading fallback also provides this path.
6. **Read match detail — functional in four personas, mobile content still loading.** Desktop French and Arabic detail content is verified; mobile first success is the score in the preceding list.

## Evidence and limits

- Five independent agent personas used isolated real Chromium 151 contexts. Root executed their bounded browser scripts centrally because per-agent network approvals stalled. Each persona inspected its own resulting screenshots and wrote its verdict.
- The local app was built for production, with real public backend reads. No production account, saved team or database mutation was used to manufacture success. Email verification, actual signup submission, authenticated save/ranking and open-round Fantasy activation remain unverified.
- Slow 3G was emulated with CDP: 2,000ms latency, 50,000 bytes/s download and upload, 375×812 touch viewport. The blank state is fixed; **initial load latency was not optimized**. This local Node server does not reproduce CDN asset compression or caching, so its 74s cold-load number is not a live-CDN performance claim.
- Chromium needed a certificate exception for workspace TLS interception. Earlier strict-TLS failures and incorrect language-radio selectors are excluded from product findings. Early development-payload timing evidence is superseded by the explicitly named production traces.
- Initial local SSR 503s were traced to Node not using the workspace's outbound proxy. With `NODE_USE_ENV_PROXY=1`, the public backend read returned 200 in 294ms, local `/` returned **200 in 1.72s**, and live `https://botolago.com/` returned **200 in 2.86s**. This was an execution-environment correction, not an application-code repair.
- Bounding boxes check actual policy-link and form-field bounds at 375px and 1440px in both languages; the intended horizontal date scroller is not page overflow. Screenshots and bounds are under [responsive](responsive/). These checks do not establish full accessibility compliance; screen-reader behavior and a complete keyboard audit remain outside this run.
- Some older raw captures remain for provenance. Only the evidence explicitly referenced here and in the updated persona verdicts supports the final findings.

## Validation and replay

- 120 relevant existing tests passed; [test log](validation/tests.log).
- TypeScript `tsc --noEmit`, targeted ESLint for all changed application files, `git diff --check`, the legal-placeholder gate and the production build passed. [Validation logs](validation/).
- The committed [scope brief](BRIEF.md) records what must be preserved and acceptance criteria before interface changes. Brand, game rules and existing policy content were preserved.
- Replay scripts are in `scripts/qa/launch-personas/`. Serve a production Node build on port 4173 with the repository's production configuration. In this workspace use `NODE_USE_ENV_PROXY=1`. Run `QA_PHASE=after node .../impatient.cjs`, `node .../skeptic.cjs`, `PHASE=after node .../mobile.cjs`, `QA_PHASE=after QA_IGNORE_TLS=1 node .../literal.cjs`, and `node .../breaker.cjs`. Add `QA_LANG=ar` for the literal Arabic check. The certificate exception belongs to this test environment, not application configuration.

No merge or deployment was performed. Public-flow QA is improved and verified; authenticated activation and live-CDN mobile performance still need a separate release check.
