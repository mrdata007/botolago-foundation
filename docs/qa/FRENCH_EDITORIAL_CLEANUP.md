# French editorial cleanup — review report

## Outcome

French reward labels now use **prix**, including singular rewards, across the shared dictionary, prize administration, landing page and demo source. Grammar and terminology were tightened in navigation, Fantasy, auth, profile, account-deletion explanations, predictions, Pépites, Curva and manager cards. Hardcoded administration messages were also reviewed and corrected. No publication, database writes, routes, styles, scoring, authentication behavior or other functionality changed.

Existing forms of address were preserved: most app screens use **vous**, while existing personal invitation/share messages retain **tu**. Arabic dictionary values were not rewritten. Only obvious English-only hardcoded admin labels gained French/Arabic equivalents.

## Exact files changed for this task

Application and demo copy:

- `src/i18n/dictionary-fr.ts` — 149 French values revised; keys and interpolation preserved.
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
- `src/i18n/dictionary-ar.ts` and both authoritative legal documents: no final diff.
- Automatic preview build log: latest observed entry at `2026-10-12T12:22:14Z` reports **build OK**. Build/typecheck were not manually invoked, following environment instructions; a separate explicit TypeScript-check result is not available and is not claimed.
- `python3 /tmp/browser/french-copy/preview_copy.py`: 24 guest/public page checks, combining French/Arabic and desktop/mobile on `/jouer`, `/prizes`, `/fantasy`, `/auth/register`, `/profile` and `/curva`. All returned 200, with correct LTR/RTL direction and no captured page exceptions. French landing/prize pages contained no reward “lot(s)”. Mobile prize screenshots confirm the new French labels and retained Arabic RTL layout.

## Limitations and deliberate exceptions

- **Owner-approved legal prose remains verbatim** in `src/content/legal/documents.ts` and `src/content/legal/prize-terms.ts`, following the explicit generated-source instruction. Those documents therefore still contain reward “lot(s)”. Legal terminology changes should be approved in the authoritative source and regenerated; rights, deadlines, retention periods and contest rules were not edited.
- Operational **lot** meaning a batch remains in Flashscore/player-mapping administration, as requested. Code identifiers and comments were not renamed.
- No authenticated admin or signed-in Fantasy journey was exercised in the browser. Those copy states were covered by source review and existing tests, not claimed as end-to-end verified.
- Live news/provider content and database-authored prize names were not rewritten: doing so would change data outside the copy-only scope.
- Demo **source** copy is updated. Its standalone generated bundle was not rebuilt or published; it needs the normal demo build process before those source changes appear there.
- The full repository test suite was not run; the report covers the relevant existing checks above.
- **Nothing was published.** The owner can inspect the diff before publication.