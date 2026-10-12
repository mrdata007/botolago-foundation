# French editorial cleanup — review report

## Outcome

French reward labels now use **prix**, including singular rewards, across the shared dictionary, prize administration, landing page and demo source. Grammar and terminology were tightened in navigation, Fantasy, auth, profile, account-deletion explanations, predictions, Pépites, Curva and manager cards. Hardcoded administration messages were also reviewed and corrected. No publication, database writes, routes, styles, scoring, authentication behavior or other functionality changed.

French UI addresses readers as **vous**, following `PRODUCT.md`; **tu** is reserved for friend-to-friend invitation/share messages. The established chip names **Joker**, **Triple Capitaine**, **Free Hit** and **Bench Boost** remain unchanged. Arabic dictionary values were not rewritten. Only obvious English-only hardcoded admin labels gained French/Arabic equivalents.

## Exact files changed for this task

Application and demo copy:

- `src/i18n/dictionary-fr.ts` — 149 French values revised; keys and interpolation preserved.
- `src/content/legal/documents.ts` — owner-authorized French reward terminology only, with dated source comment.
- `src/content/legal/prize-terms.ts` — owner-authorized French reward terminology only, with dated source comment.
- `src/routes/admin.security.tsx`
- `src/routes/admin.staff.tsx`
- `src/routes/admin.staff.$principalId.tsx`
- `src/components/admin/player-mappings/copy.ts`
- `src/components/admin/player-mappings/bulk-copy.ts`
- `src/components/admin/sofascore-player-queue/copy.ts`
- `demo/src/copy.ts`
- `demo/src/steps.ts`
- `demo/presenter/presenter.html`

Existing tests: only expected French wording updated; no new text mirror tests:

- `src/components/prizes/prize-presentation.test.ts`
- `src/components/admin/player-mappings/PlayerMappingsView.ssr.test.tsx`
- `src/components/admin/sofascore-player-queue/SofascorePlayerQueueView.ssr.test.tsx`
- `src/routes/admin-staff-grant-scoping.test.ts`
- `src/content/legal/legal-content.test.ts` — existing literal reward wording expectation updated.

Task documentation:

- `docs/briefs/2026-10-12-french-editorial-cleanup.md`
- `roadmap.md`
- `docs/qa/FRENCH_EDITORIAL_CLEANUP.md`

The workspace also contains an environment-managed dependency update in `package.json` and `bun.lock` (`@lovable.dev/vite-tanstack-config` 2.23.1 → 2.25.3). This is not an editorial change authored for this task and was not reverted.

## Representative before / after

| Before | After |
| --- | --- |
| Lots à gagner | Prix à gagner |
| Lot du mois | Prix du mois |
| Règlement des lots | Règlement des prix |
| Lots offerts par | Prix offerts par |
| Matches joués | Matchs joués |
| Transferts libres | Transferts gratuits |
| Chip actif | Jeton actif |
| Répartition par poste invalide (2 GK, 5 DEF, 5 MID, 3 FWD). | Répartition par poste invalide (2 gardiens, 5 défenseurs, 5 milieux, 3 attaquants). |
| Rejoignez la communauté BotolaGO en moins d'une minute. | Créez un compte pour enregistrer votre équipe Fantasy et suivre vos clubs. |
| Les lots arrivent bientôt | Aucun prix pour le moment |
| Cette proposition est bloquée : le monde a changé depuis qu’elle a été faite. | Cette proposition est bloquée : les données ont changé depuis sa création. |
| Le match sera ré-essayé automatiquement d’ici environ 15 minutes. | Les données du match seront traitées à nouveau automatiquement d’ici environ 15 minutes. |

## Verification

Exact final existing-test command:

```sh
bun test src/i18n src/components/landing/LandingPage.test.tsx src/components/prizes/prize-presentation.test.ts src/content/legal src/components/fpl/chip-copy.test.ts src/components/fpl/picker-copy.test.ts src/components/manager-card/copy.test.ts src/components/manager-card/moments/moments-copy.test.ts src/components/admin src/routes/admin-destructive-safety.test.ts src/routes/admin-staff-grant-scoping.test.ts src/auth
```

**469 passed, 0 failed**, 34 files, 10,168 assertions. This includes the existing i18n gate, French/Arabic key and placeholder parity, admin safety/rendering checks, auth checks and legal-content tests. Initial failures were outdated French expectations in existing tests; only those expectations were updated.

- `bun run legal:gate`: passed, no unfilled placeholders.
- `git diff 53749aa8 --check`: passed.
- Additional comparison against the original French dictionary: all **2,547 keys** and interpolation/accent tokens unchanged.
- `src/i18n/dictionary-ar.ts`: unchanged. Legal documents now include the subsequently authorized terminology-only revision described below.
- Automatic preview build log: latest observed entry at `2026-10-12T12:22:14Z` reports **build OK**. Build/typecheck were not manually invoked, following environment instructions; a separate explicit TypeScript-check result is not available and is not claimed.
- `python3 /tmp/browser/french-copy/preview_copy.py`: 24 guest/public page checks, combining French/Arabic and desktop/mobile on `/jouer`, `/prizes`, `/fantasy`, `/auth/register`, `/profile` and `/curva`. All returned 200, with correct LTR/RTL direction and no captured page exceptions. French landing/prize pages contained no reward “lot(s)”. Mobile prize screenshots confirm the new French labels and retained Arabic RTL layout.

## Limitations and deliberate exceptions

- **Owner-authorized legal terminology revision (2026-10-12):** French reward lot/lots → prix in `src/content/legal/documents.ts` and `src/content/legal/prize-terms.ts`, including titles and headings. Every other legal word, clause, eligibility rule, retention period, operator identity, deadline, version/date and Arabic text remains unchanged. Both files carry a precise dated source comment recording this limited authorization.
- Operational **lot** meaning a batch remains in Flashscore/player-mapping administration, as requested. Code identifiers and comments were not renamed.
- No authenticated admin or signed-in Fantasy journey was exercised in the browser. Those copy states were covered by source review and existing tests, not claimed as end-to-end verified.
- Live news/provider content and database-authored prize names were not rewritten: doing so would change data outside the copy-only scope.
- Demo **source** copy is updated. Its standalone generated bundle was not rebuilt or published; it needs the normal demo build process before those source changes appear there.
- The full repository test suite was not run; the report covers the relevant existing checks above.
- **Nothing was published.** The owner can inspect the diff before publication.

## Review workflow clarification

The inspection and brief were recorded before the editorial changes. On the owner's clarification, a read-only check confirmed the French dictionary retains all four established chip names and limits « tu » to personal share/invite messages; no additional application changes were needed.

At that check, the environment-managed branch was `edit/edt-6ed7336b-6152-4f69-bfd6-52fd45c42f63`, with application-copy commit `bb9aa21c0080d2cee16e80938fe6128b5146938c` (`Fixed reward labels and msgs`). Later documentation/memory edits may advance the environment-managed ref.

The owner will create the feature branch and draft PR through the GitHub connector once the final snapshot is ready. **No draft PR was created or claimed by this agent.** No Git management, merge, deployment or publication was performed.

## Final narrow review — 2026-10-12

Applied the owner's exact prize introduction and eligibility confirmation:

- `prizes.intro`: « Des prix sont à gagner à chaque journée, par bloc de 4 journées et sur l’ensemble de la saison, selon le règlement. »
- `prizes.admin.flags.remove_prompt`: « Rétablir l’éligibilité de {account} aux prix ? »
- `fantasy.points.raw_xi`: « Points du onze de départ », replacing the misleading « Points du onze avant bonus ».

### Points-label evidence

Repository-wide searches found **no current component/route use** of `fantasy.points.raw_xi` or `rawXiPoints`; the label is currently dormant rather than a displayed row. `rawXiPoints` does exist in the points view model and serialized result payload:

- `src/services/points-service.ts:119`: `engine.totalPoints + input.transferHitPoints`.
- Server adapter in the same file: `result.totalPoints + a.transferHit`.
- `src/lib/fantasy-engine.ts:367–404`: consumes each player's `totalPoints`, removes an existing mock captain multiplier and reapplies the effective captain multiplier; it does not subtract player scoring bonuses. With Bench Boost, bench players also contribute, and automatic substitutes can enter the effective eleven.
- Existing `src/services/points-service.test.ts:119–125` asserts `rawXiPoints = 60` including a 5-point captain bonus; its transfer-hit case asserts 60 before the 8-point deduction. Thus « avant bonus » is not faithful. The requested neutral label avoids a false bonus-exclusion claim; no calculation or rendering logic changed. If this dormant label is later connected to the aggregate, its Bench Boost/substitution semantics should be considered at that time.

### Final verification

```sh
bun test src/i18n src/content/legal src/services/points-service.test.ts src/lib/fantasy-engine.test.ts src/routes/fantasy.points.round.test.ts src/lib/points-unit.test.ts
bun run legal:gate
git diff --check
```

**178 tests passed, 0 failed**, 16 files, 7,942 assertions; legal placeholder gate and whitespace check passed. This includes existing locale/interpolation parity checks and points-engine checks, without new text mirror tests.

An exact source comparison confirmed **12** terminology occurrences changed in `documents.ts` and **21** in `prize-terms.ts`; apart from the dated source comments, each revised source is exactly its previous contents with only those word replacements. No agreement changes were necessary: both « lot » and « prix » are masculine, and « son lot » becomes « son prix ».

Automatic preview build log at `2026-10-12T12:27:40Z`: **build OK**. No manual build/typecheck invocation, database action or publication. Final application snapshot observed before this report update: `ca655c6d` (`Changes`), following `b763db65`; the environment may advance the ref for these documentation edits.