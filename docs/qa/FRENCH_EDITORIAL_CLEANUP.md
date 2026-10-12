# French copy cleanup — verification

## Changes

149 French dictionary values were revised for natural, concise French. Reward wording reads « prix », including singular references and grammar in navigation, prize administration, landing, Fantasy, authentication, profile, predictions, Pépites and Curva. Hardcoded administration wording and demo source copy were also reviewed. The French UI keeps « vous »; messages shared between friends retain « tu ».

The owner explicitly requested replacing reward « lots » with « prix » across the app. The French terms/privacy and prize rules therefore receive that terminology-only update, recorded in a dated source comment. No substantive legal clause, eligibility rule, deadline, retention period, operator identity, version/date or Arabic text changes.

## Examples

| Before | After |
| --- | --- |
| Lots à gagner | Prix à gagner |
| Lot de la journée | Prix de la journée |
| Règlement des lots | Règlement des prix |
| Matches | Matchs |
| Transferts libres | Transferts gratuits |
| Rejoignez la communauté BotolaGO en moins d'une minute. | Créez un compte pour enregistrer votre équipe Fantasy et suivre vos clubs. |
| Cette proposition est bloquée : le monde a changé depuis qu’elle a été faite. | Cette proposition est bloquée : les données ont changé depuis sa création. |

## Source verification

An independent comparison of the final source snapshot (`a77e9067beb2be961a92541987076f6c7a20a077` in Lovable) against `53749aa8da68d2bfc7123ea7cfad35356856cbc7` found:

- All 2,547 French dictionary keys preserved, with no missing/added keys or changed interpolation/accent tokens.
- No reward « lot » or « lots » remains in French dictionary values.
- The legal files are exactly their original contents with 12 terminology occurrences changed in `documents.ts`, 21 in `prize-terms.ts`, and the dated authorization comment added. No other legal wording changes.
- French and Arabic dictionary keys, existing Arabic dictionary values, routes, styles, scoring logic and backend files remain unchanged.
- The React screen diff changes text/labels only; existing controls, hooks, handlers, data access and accessibility structure are retained. Hardcoded English admin labels gain the existing `rtl`-controlled French/Arabic text.

The dormant `fantasy.points.raw_xi` label now reads « Points du onze de départ ». The earlier proposed « avant bonus » wording was rejected: the points-service value includes captain/player bonuses. No calculation changed. Before exposing that dormant aggregate, its automatic-substitution and Bench Boost semantics should be considered.

## Existing checks reported by the Lovable runner

Initial editorial pass:

```sh
bun test src/i18n src/components/landing/LandingPage.test.tsx src/components/prizes/prize-presentation.test.ts src/content/legal src/components/fpl/chip-copy.test.ts src/components/fpl/picker-copy.test.ts src/components/manager-card/copy.test.ts src/components/manager-card/moments/moments-copy.test.ts src/components/admin src/routes/admin-destructive-safety.test.ts src/routes/admin-staff-grant-scoping.test.ts src/auth
```

469 passed, 0 failed. Only literal wording expectations in existing tests were updated; no new mirror tests.

Final terminology/points review:

```sh
bun test src/i18n src/content/legal src/services/points-service.test.ts src/lib/fantasy-engine.test.ts src/routes/fantasy.points.round.test.ts src/lib/points-unit.test.ts
bun run legal:gate
git diff --check
```

178 passed, 0 failed; the legal-placeholder and whitespace checks passed. These test sets overlap and their counts must not be summed as distinct tests.

Lovable reported 24 guest/public browser states across French/Arabic and desktop/mobile for `/jouer`, `/prizes`, `/fantasy`, `/auth/register`, `/profile` and `/curva`: HTTP 200, correct LTR/RTL and no captured page exceptions. Its automatic preview build reported `build OK` at 2026-10-12T12:27:40Z. No separate manual TypeScript-check result is claimed.

## Review and limits

The brief was committed on `copy/french-prix-natural-wording` before the UI-source commit. This branch carries only the reviewed copy, related existing expectations and documentation. Unrelated environment updates to dependencies and the Lovable MCP manifest were excluded.

No authenticated admin or signed-in Fantasy browser journey was performed. Demo source copy changed; its generated standalone bundle still needs the normal demo build before those edits appear there. Database-authored prize names, provider/news content, and operational batch « lot » labels were left as data or batch terminology. The full repository suite was not run in this session; GitHub CI can validate the feature branch under the repository's pinned dependencies.

GitHub main was unchanged at `53749aa8da68d2bfc7123ea7cfad35356856cbc7` when the source was prepared. Nothing was merged or published. The owner reviews the draft PR before merge/publication, as required by AGENTS.md.
