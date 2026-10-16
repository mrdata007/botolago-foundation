# BotolaGO screen inventory and capture plan

Read-only inventory by screen_inventory. AGENTS.md and CLAUDE.md read. Repository is /workspace/botolago-foundation. No repository or database writes performed.

## Rendering approach

In-app browser tooling is unavailable in enabled tools; use Playwright installed by root with Chromium. All screenshots must be explicitly labeled development mock fixtures, never production. Port 4173 must serve this checkout. Existing browser tests document mock data modes; set VITE_AUTH_MODE, VITE_FOOTBALL_DATA_MODE, VITE_NEWS_DATA_MODE, VITE_FANTASY_DATA_MODE, VITE_PREDICTIONS_DATA_MODE, VITE_PEPITES_DATA_MODE, VITE_MANAGER_CARD_DATA_MODE, VITE_NOTIFICATIONS_DATA_MODE to mock. Curva, Pépites, prizes, news and Plus build flags currently read true; preview flags may be set in dev but are not necessary for those compiled build flags. Premium service always uses mock in DEV.

Initialize localStorage botolago.welcomed=1, botolago.prizes.welcome.v1=1, botolago.language=fr|ar; sessionStorage botolago.splashShown=1. Retain a separate first-visit capture without these flags to inspect welcome dialog and landing. Mobile 390x844, desktop 1440x1000, both languages; narrow 320x700 spot checks for copy overflow. Theme light initial baseline, focused dark checks if typography changes affect both.

Signed-in mock uses localStorage botolago.auth.users with demo user usr_demo / demo@botolago.ma, profileComplete=true, verified=true, favoriteClubId=war, language=fr|ar; botolago.auth.session={kind:user,userId:usr_demo,createdAt:2026-09-01T00:00:00Z}. Existing tests/e2e/curva.e2e.ts has exact fixture. Ordinary mock login demo@botolago.ma / demo1234 also works, verification code 123456, but synthetic preloaded session needs no action or write.

## Implemented route inventory

| Route | Source file |
| --- | --- |
| `/.lovable/oauth/consent` | `src/routes/[.]lovable.oauth.consent.tsx` |
| `/admin/approvals` | `src/routes/admin.approvals.tsx` |
| `/admin/audit` | `src/routes/admin.audit.tsx` |
| `/admin/football/player-mappings` | `src/routes/admin.football.player-mappings.tsx` |
| `/admin/football/sofascore-players` | `src/routes/admin.football.sofascore-players.tsx` |
| `/admin/news/$articleEditionId` | `src/routes/admin.news.$articleEditionId.tsx` |
| `/admin/news/new` | `src/routes/admin.news.new.tsx` |
| `/admin/news` | `src/routes/admin.news.tsx` |
| `/admin/pepites/donnees` | `src/routes/admin.pepites.donnees.tsx` |
| `/admin/pepites/` | `src/routes/admin.pepites.index.tsx` |
| `/admin/pepites` | `src/routes/admin.pepites.tsx` |
| `/admin/plus` | `src/routes/admin.plus.tsx` |
| `/admin/prizes` | `src/routes/admin.prizes.tsx` |
| `/admin/security` | `src/routes/admin.security.tsx` |
| `/admin/staff/$principalId` | `src/routes/admin.staff.$principalId.tsx` |
| `/admin/staff` | `src/routes/admin.staff.tsx` |
| `/admin/stories` | `src/routes/admin.stories.tsx` |
| `/admin` | `src/routes/admin.tsx` |
| `/admin/users/$userId` | `src/routes/admin.users.$userId.tsx` |
| `/admin/users` | `src/routes/admin.users.tsx` |
| `/auth/callback` | `src/routes/auth.callback.tsx` |
| `/auth/forgot-password` | `src/routes/auth.forgot-password.tsx` |
| `/auth/` | `src/routes/auth.index.tsx` |
| `/auth/login` | `src/routes/auth.login.tsx` |
| `/auth/mfa-challenge` | `src/routes/auth.mfa-challenge.tsx` |
| `/auth/profile-setup` | `src/routes/auth.profile-setup.tsx` |
| `/auth/register` | `src/routes/auth.register.tsx` |
| `/auth` | `src/routes/auth.tsx` |
| `/auth/update-password` | `src/routes/auth.update-password.tsx` |
| `/auth/verify` | `src/routes/auth.verify.tsx` |
| `/clubs/$clubId` | `src/routes/clubs.$clubId.tsx` |
| `/clubs/` | `src/routes/clubs.index.tsx` |
| `/curva/carte` | `src/routes/curva.carte.tsx` |
| `/curva/classement` | `src/routes/curva.classement.tsx` |
| `/curva/` | `src/routes/curva.index.tsx` |
| `/curva/les-votres` | `src/routes/curva.les-votres.tsx` |
| `/curva/plus` | `src/routes/curva.plus.tsx` |
| `/curva/saisons` | `src/routes/curva.saisons.tsx` |
| `/curva` | `src/routes/curva.tsx` |
| `/demo` | `src/routes/demo.tsx` |
| `/dev/admin-shell-sample` | `src/routes/dev.admin-shell-sample.tsx` |
| `/dev/curva-ranking-sample` | `src/routes/dev.curva-ranking-sample.tsx` |
| `/dev/manager-card-editions` | `src/routes/dev.manager-card-editions.tsx` |
| `/dev/manager-card-ovr-change-sample` | `src/routes/dev.manager-card-ovr-change-sample.tsx` |
| `/dev/manager-card-sample` | `src/routes/dev.manager-card-sample.tsx` |
| `/dev/player-mappings-sample` | `src/routes/dev.player-mappings-sample.tsx` |
| `/dev/plus-admin-sample` | `src/routes/dev.plus-admin-sample.tsx` |
| `/dev/sofascore-players-sample` | `src/routes/dev.sofascore-players-sample.tsx` |
| `/fantasy/briefing` | `src/routes/fantasy.briefing.tsx` |
| `/fantasy/create` | `src/routes/fantasy.create.tsx` |
| `/fantasy/fixtures` | `src/routes/fantasy.fixtures.tsx` |
| `/fantasy/help` | `src/routes/fantasy.help.tsx` |
| `/fantasy/` | `src/routes/fantasy.index.tsx` |
| `/fantasy/leagues/$leagueId` | `src/routes/fantasy.leagues.$leagueId.tsx` |
| `/fantasy/leagues/join` | `src/routes/fantasy.leagues.join.tsx` |
| `/fantasy/leagues` | `src/routes/fantasy.leagues.tsx` |
| `/fantasy/players/$playerId` | `src/routes/fantasy.players.$playerId.tsx` |
| `/fantasy/players` | `src/routes/fantasy.players.tsx` |
| `/fantasy/points` | `src/routes/fantasy.points.tsx` |
| `/fantasy/profile` | `src/routes/fantasy.profile.tsx` |
| `/fantasy/rankings` | `src/routes/fantasy.rankings.tsx` |
| `/fantasy/rules` | `src/routes/fantasy.rules.tsx` |
| `/fantasy/team` | `src/routes/fantasy.team.tsx` |
| `/fantasy/top-players` | `src/routes/fantasy.top-players.tsx` |
| `/fantasy/transfers` | `src/routes/fantasy.transfers.tsx` |
| `/fantasy` | `src/routes/fantasy.tsx` |
| `/` | `src/routes/index.tsx` |
| `/jouer` | `src/routes/jouer.tsx` |
| `/journee/$publicId` | `src/routes/journee.$publicId.tsx` |
| `/matches/$matchId` | `src/routes/matches.$matchId.tsx` |
| `/matches/` | `src/routes/matches.index.tsx` |
| `/matches/standings` | `src/routes/matches.standings.tsx` |
| `/news/$articleId` | `src/routes/news.$articleId.tsx` |
| `/news` | `src/routes/news.tsx` |
| `/notifications` | `src/routes/notifications.tsx` |
| `/pepites/classement` | `src/routes/pepites.classement.tsx` |
| `/pepites/comparer` | `src/routes/pepites.comparer.tsx` |
| `/pepites/` | `src/routes/pepites.index.tsx` |
| `/pepites/joueur/$playerId` | `src/routes/pepites.joueur.$playerId.tsx` |
| `/pepites/methode` | `src/routes/pepites.methode.tsx` |
| `/pepites/revelation` | `src/routes/pepites.revelation.tsx` |
| `/pepites/semaine/$n` | `src/routes/pepites.semaine.$n.tsx` |
| `/pepites` | `src/routes/pepites.tsx` |
| `/plus` | `src/routes/plus.tsx` |
| `/privacy` | `src/routes/privacy.tsx` |
| `/prizes/` | `src/routes/prizes.index.tsx` |
| `/prizes/terms` | `src/routes/prizes.terms.tsx` |
| `/profile/saved` | `src/routes/profile.saved.tsx` |
| `/profile/security` | `src/routes/profile.security.tsx` |
| `/profile` | `src/routes/profile.tsx` |
| `/pronostics/` | `src/routes/pronostics.index.tsx` |
| `/pronostics/ligues/$leagueId` | `src/routes/pronostics.ligues.$leagueId.tsx` |
| `/pronostics/ligues/` | `src/routes/pronostics.ligues.index.tsx` |
| `/pronostics/ligues/rejoindre` | `src/routes/pronostics.ligues.rejoindre.tsx` |
| `/pronostics` | `src/routes/pronostics.tsx` |
| `/suppression-compte` | `src/routes/suppression-compte.tsx` |
| `/terms` | `src/routes/terms.tsx` |
| `/unsubscribe` | `src/routes/unsubscribe.tsx` |

## Source-discovered states and capture/access paths

- Home `/`: anonymous first-visit welcome/language dialog; landing before welcomed; returning home; signed-in home, stories (`StoryViewer`), voting auth prompt and guest picks. `/jouer` provides landing directly for all identities. `/demo` redirects to static pitch demo `/demo/index.html`.
- News `/news`: category, club, saved filters, loading/error/empty/feed. Follow a rendered article link for valid detail ID; detail states article, media fallback, bookmark and share. `/profile/saved` has anonymous/signed-in empty/saved states.
- Matches `/matches`: calendar date selection, all/live/finished filters, empty date, pagination and season. `/matches/standings`: table and season selection. Match fixture `/matches/00000020-0000-4000-8000-000000000001`: `?tab=summary|stats|lineups|h2h`; fixture 1 live, 2 upcoming, 5 finished (tests/e2e/pronostics.e2e.ts). Include match vote, exact prediction, reminder auth prompt; loading/error/not-found and unplayed stats/lineups.
- Clubs `/clubs`: catalog and follow. `/clubs/00000010-0000-4000-8000-000000000001`: `?tab=overview|matches|standings|squad`, season filters, follow auth prompt, squad position/player cards.
- Fantasy `/fantasy`: guest intro, member hub, availability off/error, deadline open/live/provisional/final. `/fantasy/create`: onboarding team/manager identity, builder, add-player drawer and advanced filters, squad list/pitch, action sheet, team save/import/conflict prompts; preview mock initial squad is already populated. `/fantasy/team`: pitch/list, player action sheet, captain/vice picker, substitution, chips and confirmation. `/fantasy/transfers`: pitch/list, add/search/filter/detail player, transfer preview and confirm. `/fantasy/points`: gameweek picker, pitch/list, provisional/final, recap share, no result. `/fantasy/fixtures`, `/fantasy/players`, `/fantasy/players/fp_rca_1`, `/fantasy/top-players`, `/fantasy/rankings`: filters, ranking rows, empty/loading/error states. `/fantasy/profile`: season and manager tabs. `/fantasy/leagues`: leagues/cups tabs, create disclosure, created invite state, no leagues/read-failure; `/fantasy/leagues/join`: invitation validation and join; follow rendered league for valid mock league detail, rank rows and leave confirmation. `/fantasy/rules` and `/fantasy/help`: all rule sections/FAQ disclosures. `/journee/$publicId`: public shared recap; valid public ID requires a fixture or backend read and is not invented.
- Pronostics `/pronostics`: `?tab=classement|ligues`, default predictions; `?journee=13` for finished earlier round; exact-score steppers, rules sheet, sharing sheet, guest sync and validation; `/pronostics/ligues/rejoindre#code=A1B2C3D4E5F60718293A4B5C6D7E8F90&game=predictions` known mock invitation; direct `/pronostics/ligues` redirects to tab; follow rendered league detail. Development-only switch uses sessionStorage `botolago.e2e.predictions-mode=off` then client navigation to the next journée (see test); no `__predictionsMock` fixture exists.
- Pépites `/pepites`, `/pepites/semaine/14`, `/pepites/classement`, `/pepites/revelation`, `/pepites/comparer`, `/pepites/methode`, `/pepites/joueur/7e300000-0000-4000-8000-000000000001`: edition current/archive, ranking sort/filter, compare slots and picker sheet, player follow/auth prompt/share/report issue. `window.__pepitesMock` supports state countdown/delayed, nextRevealAt, publishNext, offline; `window.__pepitesPoll` supports shortened test poll intervals. Full loading/error/unpublished states are documented tests/e2e/pepites.e2e.ts.
- Curva `/curva`: `?mc=rated|forming1|founder|seasonClosed|seasonStarted|born0Serial|tierUp|offline|noCard|featureOff`; fixture persists in sessionStorage botolago.mc.fixture. `/curva/carte?mc=rated|insufficient3|founder`; `/curva/les-votres?mc=rated` people/league and head-to-head; `/curva/saisons?mc=rated|born0`; `/curva/classement` ranking. Share-card sheet, replay sheet, tier ceremony and born panel are additional overlays. Guest state requires no seeded session; featureOff redirects to Fantasy.
- Plus `/plus` standalone offer; `/curva/plus` short paywall, `?step=1|2|3|4|5` preview/story/offer/welcome/payment; `via=season|duel|career|editions`. Mock `?plus=none|season|ended|nopay|monthly|yearly|cancelling|grace|expired|off` selects membership/payment state; member welcome requires `plus=season`. Premium panels also appear in Curva home/seasons/duel, Fantasy briefing, Profile membership, trophies and style picker. `/fantasy/briefing` member/locked, scenario controls in its mock repository.
- Profile `/profile`: anonymous, guest, signed-in, profile editor route, language menu, notification preferences, appearance, sign-out confirmation, deletion acknowledgement dialog and pending/recoverable deletion. `/profile/security`: loading, mock-unavailable, MFA enrollment QR/secret/verification, enabled factors; real enrollment states require Supabase-backed auth or explicit rendering fixture, not available from mock. `/notifications`: anonymous gate, empty/read/unread/filter; notification preferences are profile controls. `/suppression-compte`: explanation and `?confirmation=1` follow-up; `/unsubscribe`: token validation, invalid, submitted/success require valid fixture token.
- Auth `/auth` gateway, `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/verify`, `/auth/profile-setup`, `/auth/update-password`, `/auth/mfa-challenge`, `/auth/callback`: default/error/validation/submitting/success; verified/profileComplete seeded user redirects away from some screens. Capture auth guest context. MFA, callback and OAuth consent require valid session/callback fixture, otherwise only their actual blocked/error render may be claimed. Never submit production auth forms.
- Legal `/terms`, `/privacy`, `/prizes/terms`, `/suppression-compte`, prizes `/prizes` and welcome arrival. Long content must be inspected with full-page screenshots; preserve legal facts and placeholders.
- Admin `/admin` and children are implemented, but real authorized data screens need Supabase staff session/MFA. Without credentials, capture their actual guard state and list functional data screens as inaccessible. Read-only dev samples cover `/dev/admin-shell-sample?view=home|plus&lang=fr|ar`, `/dev/plus-admin-sample`, `/dev/player-mappings-sample`, `/dev/sofascore-players-sample`; those are invented data and do not prove live authorization flows. Staff/users/news/stories/approvals/audit/security/analytics/prizes/Pépites admin surfaces have no universal synthetic admin session.

## Existing browser evidence/tests to reuse

`tests/e2e/anonymous.acceptance.e2e.ts`: core public routes FR+AR from 320 to 1440, welcome/splash. `mobile-readability.e2e.ts`: real bounding boxes and font metrics. `context-restoration.e2e.ts`: filters/search/tab routing. `pronostics.e2e.ts`: guest/member predictions, league invitation, failure fixture. `pepites.e2e.ts`: reveal/picker/report/compare and outage. `curva.e2e.ts`: full fixture matrix, head-to-head and moments. `accessibility-keyboard.e2e.ts`: keyboard/modal behavior. `empty-states.e2e.ts`: actual rendered empty date and Fantasy history. `fantasy.journey.e2e.ts`: real authenticated journey, skipped unless E2E_FANTASY_EMAIL/PASSWORD injected; contains writes and must NOT be executed during read-only audit. Staging/news CMS authenticated journeys likewise may write and are not read-only evidence. `built-output.smoke.e2e.ts` uses local HTTP stub Supabase, not production.

## Capture status

Server ready with all mock modes and Chromium /usr/bin/chromium. Verified captures are in /tmp/botolago-screens/verified and verified-extended. The earlier before and baseline directories are rejected runs (Vite overlay, then premature French SSR under AR filenames); DO NOT use them as UI evidence. Verified captures assert exact html lang, data-lang and dir before screenshot. Four viewport/language contexts run in parallel. Final manifests, inspection scope and limitations are recorded below and in /tmp/botolago-coverage.json.

## Overlay source inventory (inspection, not rendered coverage)

- `src/components/common/ShareImageSheet.tsx`: line 148 `<UiSheet open={open} onOpenChange={setOpen} title={label}>`
- `src/components/curva/HeadToHeadSheet.tsx`: line 73 `<UiSheet open={open} onOpenChange={onOpenChange} title={copy.h2hTitle}>`
- `src/components/curva/MateTrophies.tsx`: line 76 `<UiSheet`
- `src/components/fantasy/GameweekRecapCard.tsx`: line 153 `<ShareImageSheet`
- `src/components/fpl/AddPlayerScreen.tsx`: line 460 `<UiSheet`, line 664 `<UiSheet`
- `src/components/fpl/CaptainChoice.tsx`: line 119 `<UiSheet`
- `src/components/fpl/PlayerActionSheet.tsx`: line 127 `<UiSheet`
- `src/components/home/StoryViewer.tsx`: line 332 `<Dialog.Root`, line 338 `<Dialog.Portal>`, line 339 `<Dialog.Overlay className="fixed inset-0 z-50 bg-black/95" />`, line 340 `<Dialog.Content`, line 353 `<Dialog.Title className="sr-only">{ar ? story.titleAr : story.titleFr}</Dialog.Title>`
- `src/components/manager-card/moments/InviteFriends.tsx`: line 142 `<UiSheet open={open} onOpenChange={onOpenChange} title={t("fantasy.hub.invite_share")`
- `src/components/manager-card/moments/ReplaySheet.tsx`: line 46 `<UiSheet`
- `src/components/manager-card/moments/ShareCardSheet.tsx`: line 321 `<UiSheet open={shown} onOpenChange={onOpenChange} title={label} footer={footer}>`
- `src/components/pepites/PepitesComparePage.tsx`: line 502 `<UiSheet`
- `src/components/pepites/PepitesFollowButton.tsx`: line 183 `<UiSheet`
- `src/components/pepites/PepitesPlayerShareButton.tsx`: line 51 `<PepitesShareSheet`
- `src/components/pepites/PepitesShareButton.tsx`: line 35 `<PepitesShareSheet`
- `src/components/pepites/PepitesShareSheet.tsx`: line 9 `return <ShareImageSheet {...props} campaign="pepites" testIdPrefix="pepites" />;`
- `src/components/pepites/ReportIssueSheet.tsx`: line 86 `<UiSheet`
- `src/components/plus/PlusRecapSection.tsx`: line 567 `<ShareImageSheet`
- `src/components/plus/PlusRivalPoster.tsx`: line 339 `<ShareImageSheet`
- `src/components/plus/PlusStylePicker.tsx`: line 109 `<UiSheet`
- `src/components/plus/TrophyDetail.tsx`: line 181 `<ShareImageSheet`
- `src/components/predictions/PredictionsPage.tsx`: line 118 `<ScoringRulesSheet open={rulesOpen} onOpenChange={setRulesOpen} />`
- `src/components/predictions/PredictionsShareButton.tsx`: line 78 `<UiSheet`
- `src/components/predictions/ScoringRulesSheet.tsx`: line 15 `<UiSheet open={open} onOpenChange={onOpenChange} title={t("predictions.rules.title")}`
- `src/components/ui/command.tsx`: line 28 `<Dialog {...props}>`
- `src/components/ui-kit/primitives.tsx`: line 1397 `<Dialog.Overlay`, line 1411 `<Dialog.Close`, line 1475 `<Dialog.Root open={open} onOpenChange={onOpenChange}>`, line 1476 `<Dialog.Portal>`, line 1478 `<Dialog.Content`, line 1496 `<Dialog.Title className="sr-only">{title}</Dialog.Title>`, line 1498 `<Dialog.Description className="sr-only">{description}</Dialog.Description>`, line 1504 `<Dialog.Title`, line 1510 `<Dialog.Description`, line 1563 `<Dialog.Root open={open} onOpenChange={onOpenChange}>`, line 1564 `<Dialog.Portal>`, line 1566 `<Dialog.Content`, line 1584 `<Dialog.Title className={ui.text.section}>{title}</Dialog.Title>`, line 1586 `<Dialog.Description className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>`
- `src/routes/__root.tsx`: line 362 `<AuthPromptDialog />`
- `src/routes/fantasy.create.tsx`: line 494 `<CaptainChoice`, line 669 `<PlayerActionSheet`
- `src/routes/fantasy.team.tsx`: line 737 `<PlayerActionSheet`
- `src/routes/fantasy.transfers.tsx`: line 975 `<PlayerActionSheet`

## Baseline isolation and evidence provenance

Root committed the required pre-edit brief at dda4bea4, then froze the full pre-change tree in /tmp/botolago-baseline and started its own mock dev server at 4174. All 4173 capture processes were stopped before root began UI edits; subsequent full baseline captures target 4174. Script /tmp/botolago-capture.mjs defaults to 4174 and accepts CAPTURE_BASE_URL for deliberate after captures. Final baseline directory frozen-before is from that fixed source; verified and verified-extended contain earlier pre-edit actual captures from 4173. The interrupted runs have been removed from the valid manifests or explicitly marked reconstructed metadata. These are development mock fixtures, with dummy payment details and synthetic accounts; no production session or database data is represented.

Callback is special: IS_MOCK_AUTH unconditionally redirects /auth/callback home, so the real callback error/assurance screen cannot be rendered under the all-mock server. Profile setup DOES render with the signed demo session and ?step=1|2|3; it does not require an incomplete account. MFA enrollment cannot proceed in mock auth and only shows the actual mock-unavailable state. Manager-card development fixtures and Plus scenarios are real component renders fed invented data.

## Additional modal/menu sources

- `src/components/auth/AuthPromptDialog.tsx`: line 44 `<UiModal`
- `src/components/fantasy/FantasyOnboarding.tsx`: line 115 `<UiModal`
- `src/components/predictions/leagues/LeaguePage.tsx`: line 186 `<UiModal`, line 208 `<UiModal`
- `src/components/prizes/PrizeWelcome.tsx`: line 76 `<UiModal`
- `src/components/report/ReportNameMenu.tsx`: line 86 `<UiMenu`
- `src/components/shell/LanguageSwitcher.tsx`: line 62 `<UiMenu label={t("language.switch")} trigger={trigger}>`
- `src/routes/fantasy.leagues.$leagueId.tsx`: line 507 `<UiModal`, line 530 `<UiModal`
- `src/routes/profile.tsx`: line 271 `<UiModal`, line 641 `<UiMenu`, line 883 `<UiModal`


## Final coverage and inspection scope

- **98 route definitions inventoried from source:** 59 have a captured requested view, 5 are layouts present in captured routes, 6 have captured redirect destinations, 1 (`/admin`) has only the actual generic error fallback, and 27 remain source-only. Definitions include layouts and aliases; this is not a claim of 98 distinct page designs.
- **435 successful screenshot artifacts**, including repeated baseline attempts and viewport/language variants; 322 unique named state/language/viewport combinations. There are 224 French and 211 Arabic captures, 255 mobile and 180 desktop. A successful capture means its screenshot was saved after the language/direction assertions (the separate static demo stage is explicitly exempt). It does not imply all business data or all actions were verified.
- **Image inspection:** 6 images viewed individually in full; 169 mobile screenshots viewed through 21 contact sheets of only their first 615 pixels; 265 artifacts captured without image inspection by this lane. Five full images also appear in contact sheets. Contact-sheet review confirms visible layout/state only, not full-page copy, all legal content, contrast or interaction behavior. Other agents may have independent inspection evidence; it is not silently attributed here.
- **71 modal/menu/sheet source entries** are indexed in `sourceOverlayInventory` in the JSON, alongside per-route source-discovered states. A source inventory entry is not a claim that its overlay was opened. Named capture states identify the overlays that were actually opened.
- 123 excluded/interrupted or failed attempts are retained as diagnostics. Early Vite overlays, premature French SSR under Arabic filenames, client-entry/cache failures, timeouts and process interruptions are not accepted screen evidence. No failing attempt is reported as a product test passing.

The canonical structured report is **`/tmp/botolago-coverage.json`**. It records every definition's route, source, kind, status, attempted flag, reachability, source state inventory, captured states, screenshot/manifest/contact-sheet evidence and issues. It distinguishes an unattempted developer sample from a backend/session-dependent state and from a failed capture. Trailing slashes are normalized, and static routes take precedence over dynamic route patterns (e.g. `/pronostics/ligues/rejoindre` is not counted as `$leagueId`).

### Confirmed targeted evidence

The final isolated-cache sequential batches contain no capture failures:

- `/tmp/botolago-screens/frozen-final-targeted-before/manifest.json`: 32 images, French/Arabic × mobile/desktop, covering terms, privacy, prizes, prize terms, invalid unsubscribe, synthetic-token confirmation, missing public recap and a real rendered Pronostics league component. The existing mock league membership was seeded only in browser localStorage, then its displayed link was followed. No join, create, leave, reset, unsubscribe or token-validation action was submitted.
- `/tmp/botolago-screens/frozen-final-auth-before/manifest.json`: 11 images, covering `/auth` → login, `/pronostics/ligues` → the leagues tab, an OTP form opened with `preview@example.test`, anonymous MFA → login, `/admin`'s generic error fallback, and the existing separate static demo stage at `/demo/index.html`. No code/email request or verification was sent.
- Dynamic article and Fantasy league links were followed from actual rendered lists; screenshots name their actual hrefs. The Pépites player detail and legacy Fantasy player detail are actual mock component renders, not invented screenshots.
- Match statistics and lineup absence, live/upcoming/finished fixtures, club tabs, prior Pronostics round, Curva forming/no-card/offline/empty-season, Plus preview/welcome/missing-payment states, deletion confirmation, language menu, sign-out/delete dialogs, rules sheet and player picker were actually rendered. The JSON distinguishes full-image, contact-sheet and capture-only review.

### Limits that remain

- **Admin:** `/admin` rendered the generic root error screen in the anonymous mock environment (HTTP 200), not an authorized console or a staff sign-in/MFA/permission gate. All authorized admin underlying views remain source-only and require suitable staff backend/session fixtures. The 8 developer sample routes were inventoried but not rendered; they are not claimed as inaccessible.
- **OAuth consent:** a valid client/request and authenticated consent session were unavailable. The consent view remains source-only; no guard was bypassed.
- **MFA/callback:** anonymous MFA redirection and the mock security-unavailable screen were observed. Real factor enrollment, QR/secret, challenge, assurance retry, callback token/recovery/OAuth exchange and successful verification remain source-only. Mock callbacks always redirect home.
- **Verification:** the OTP entry form is rendered with a synthetic email query. No pending real verification, resend or successful code submission was exercised; the form's displayed email-sent wording is not evidence that an email was sent by this audit.
- **Fantasy creation:** the existing mock team redirects `/fantasy/create` to `/fantasy/team`. The initial empty-squad builder, initial save and account handoff remain source-only in this fixture. No team was created or changed.
- **Public recap:** mock mode unconditionally returns `null`; only the missing-recap screen was captured. A successful published recap needs a valid backend fixture or public ID and was not fabricated.
- **Tokens/payments/native:** only invalid and synthetic-shaped unsubscribe confirmation views were rendered; no successful unsubscribe, real token or payment action was exercised. Payment details are the mock examples. Native permission dialogs, push delivery and real account-deletion processing were not exercised.
- **Loading/error evidence:** one original FR mobile Fantasy team image visibly shows the actual loading skeleton and is explicitly labeled loading. A later ready-state capture waits for `team-facts`. Curva's offline error was deliberately selected with `mc=offline`; the Admin root error was actually seen. Other possible loading/error branches listed from source are not claimed as forced or inspected.
- **First arrival and static demo:** first-launch splash/language chooser remain source-inventoried states here; the static demo stage is a separate embedded app and only its initial French stage was inspected, not every embedded step or Arabic variant.

### Final per-definition status

| Route | Source | Coverage status |
| --- | --- | --- |
| `/.lovable/oauth/consent` | `src/routes/[.]lovable.oauth.consent.tsx` | `source_only` |
| `/admin/approvals` | `src/routes/admin.approvals.tsx` | `source_only` |
| `/admin/audit` | `src/routes/admin.audit.tsx` | `source_only` |
| `/admin/football/player-mappings` | `src/routes/admin.football.player-mappings.tsx` | `source_only` |
| `/admin/football/sofascore-players` | `src/routes/admin.football.sofascore-players.tsx` | `source_only` |
| `/admin/news/$articleEditionId` | `src/routes/admin.news.$articleEditionId.tsx` | `source_only` |
| `/admin/news/new` | `src/routes/admin.news.new.tsx` | `source_only` |
| `/admin/news` | `src/routes/admin.news.tsx` | `source_only` |
| `/admin/pepites/donnees` | `src/routes/admin.pepites.donnees.tsx` | `source_only` |
| `/admin/pepites/` | `src/routes/admin.pepites.index.tsx` | `source_only` |
| `/admin/pepites` | `src/routes/admin.pepites.tsx` | `source_only` |
| `/admin/plus` | `src/routes/admin.plus.tsx` | `source_only` |
| `/admin/prizes` | `src/routes/admin.prizes.tsx` | `source_only` |
| `/admin/security` | `src/routes/admin.security.tsx` | `source_only` |
| `/admin/staff/$principalId` | `src/routes/admin.staff.$principalId.tsx` | `source_only` |
| `/admin/staff` | `src/routes/admin.staff.tsx` | `source_only` |
| `/admin/stories` | `src/routes/admin.stories.tsx` | `source_only` |
| `/admin` | `src/routes/admin.tsx` | `error_fallback_captured_only` |
| `/admin/users/$userId` | `src/routes/admin.users.$userId.tsx` | `source_only` |
| `/admin/users` | `src/routes/admin.users.tsx` | `source_only` |
| `/auth/callback` | `src/routes/auth.callback.tsx` | `redirect_captured` |
| `/auth/forgot-password` | `src/routes/auth.forgot-password.tsx` | `captured` |
| `/auth/` | `src/routes/auth.index.tsx` | `redirect_captured` |
| `/auth/login` | `src/routes/auth.login.tsx` | `captured` |
| `/auth/mfa-challenge` | `src/routes/auth.mfa-challenge.tsx` | `redirect_captured` |
| `/auth/profile-setup` | `src/routes/auth.profile-setup.tsx` | `captured` |
| `/auth/register` | `src/routes/auth.register.tsx` | `captured` |
| `/auth` | `src/routes/auth.tsx` | `layout_in_captured_routes` |
| `/auth/update-password` | `src/routes/auth.update-password.tsx` | `captured` |
| `/auth/verify` | `src/routes/auth.verify.tsx` | `captured` |
| `/clubs/$clubId` | `src/routes/clubs.$clubId.tsx` | `captured` |
| `/clubs/` | `src/routes/clubs.index.tsx` | `captured` |
| `/curva/carte` | `src/routes/curva.carte.tsx` | `captured` |
| `/curva/classement` | `src/routes/curva.classement.tsx` | `captured` |
| `/curva/` | `src/routes/curva.index.tsx` | `captured` |
| `/curva/les-votres` | `src/routes/curva.les-votres.tsx` | `captured` |
| `/curva/plus` | `src/routes/curva.plus.tsx` | `captured` |
| `/curva/saisons` | `src/routes/curva.saisons.tsx` | `captured` |
| `/curva` | `src/routes/curva.tsx` | `layout_in_captured_routes` |
| `/demo` | `src/routes/demo.tsx` | `redirect_captured` |
| `/dev/admin-shell-sample` | `src/routes/dev.admin-shell-sample.tsx` | `source_only` |
| `/dev/curva-ranking-sample` | `src/routes/dev.curva-ranking-sample.tsx` | `source_only` |
| `/dev/manager-card-editions` | `src/routes/dev.manager-card-editions.tsx` | `source_only` |
| `/dev/manager-card-ovr-change-sample` | `src/routes/dev.manager-card-ovr-change-sample.tsx` | `source_only` |
| `/dev/manager-card-sample` | `src/routes/dev.manager-card-sample.tsx` | `source_only` |
| `/dev/player-mappings-sample` | `src/routes/dev.player-mappings-sample.tsx` | `source_only` |
| `/dev/plus-admin-sample` | `src/routes/dev.plus-admin-sample.tsx` | `source_only` |
| `/dev/sofascore-players-sample` | `src/routes/dev.sofascore-players-sample.tsx` | `source_only` |
| `/fantasy/briefing` | `src/routes/fantasy.briefing.tsx` | `captured` |
| `/fantasy/create` | `src/routes/fantasy.create.tsx` | `redirect_captured` |
| `/fantasy/fixtures` | `src/routes/fantasy.fixtures.tsx` | `captured` |
| `/fantasy/help` | `src/routes/fantasy.help.tsx` | `captured` |
| `/fantasy/` | `src/routes/fantasy.index.tsx` | `captured` |
| `/fantasy/leagues/$leagueId` | `src/routes/fantasy.leagues.$leagueId.tsx` | `captured` |
| `/fantasy/leagues/join` | `src/routes/fantasy.leagues.join.tsx` | `captured` |
| `/fantasy/leagues` | `src/routes/fantasy.leagues.tsx` | `captured` |
| `/fantasy/players/$playerId` | `src/routes/fantasy.players.$playerId.tsx` | `captured` |
| `/fantasy/players` | `src/routes/fantasy.players.tsx` | `captured` |
| `/fantasy/points` | `src/routes/fantasy.points.tsx` | `captured` |
| `/fantasy/profile` | `src/routes/fantasy.profile.tsx` | `captured` |
| `/fantasy/rankings` | `src/routes/fantasy.rankings.tsx` | `captured` |
| `/fantasy/rules` | `src/routes/fantasy.rules.tsx` | `captured` |
| `/fantasy/team` | `src/routes/fantasy.team.tsx` | `captured` |
| `/fantasy/top-players` | `src/routes/fantasy.top-players.tsx` | `captured` |
| `/fantasy/transfers` | `src/routes/fantasy.transfers.tsx` | `captured` |
| `/fantasy` | `src/routes/fantasy.tsx` | `layout_in_captured_routes` |
| `/` | `src/routes/index.tsx` | `captured` |
| `/jouer` | `src/routes/jouer.tsx` | `captured` |
| `/journee/$publicId` | `src/routes/journee.$publicId.tsx` | `captured` |
| `/matches/$matchId` | `src/routes/matches.$matchId.tsx` | `captured` |
| `/matches/` | `src/routes/matches.index.tsx` | `captured` |
| `/matches/standings` | `src/routes/matches.standings.tsx` | `captured` |
| `/news/$articleId` | `src/routes/news.$articleId.tsx` | `captured` |
| `/news` | `src/routes/news.tsx` | `captured` |
| `/notifications` | `src/routes/notifications.tsx` | `captured` |
| `/pepites/classement` | `src/routes/pepites.classement.tsx` | `captured` |
| `/pepites/comparer` | `src/routes/pepites.comparer.tsx` | `captured` |
| `/pepites/` | `src/routes/pepites.index.tsx` | `captured` |
| `/pepites/joueur/$playerId` | `src/routes/pepites.joueur.$playerId.tsx` | `captured` |
| `/pepites/methode` | `src/routes/pepites.methode.tsx` | `captured` |
| `/pepites/revelation` | `src/routes/pepites.revelation.tsx` | `captured` |
| `/pepites/semaine/$n` | `src/routes/pepites.semaine.$n.tsx` | `captured` |
| `/pepites` | `src/routes/pepites.tsx` | `layout_in_captured_routes` |
| `/plus` | `src/routes/plus.tsx` | `captured` |
| `/privacy` | `src/routes/privacy.tsx` | `captured` |
| `/prizes/` | `src/routes/prizes.index.tsx` | `captured` |
| `/prizes/terms` | `src/routes/prizes.terms.tsx` | `captured` |
| `/profile/saved` | `src/routes/profile.saved.tsx` | `captured` |
| `/profile/security` | `src/routes/profile.security.tsx` | `captured` |
| `/profile` | `src/routes/profile.tsx` | `captured` |
| `/pronostics/` | `src/routes/pronostics.index.tsx` | `captured` |
| `/pronostics/ligues/$leagueId` | `src/routes/pronostics.ligues.$leagueId.tsx` | `captured` |
| `/pronostics/ligues/` | `src/routes/pronostics.ligues.index.tsx` | `redirect_captured` |
| `/pronostics/ligues/rejoindre` | `src/routes/pronostics.ligues.rejoindre.tsx` | `captured` |
| `/pronostics` | `src/routes/pronostics.tsx` | `layout_in_captured_routes` |
| `/suppression-compte` | `src/routes/suppression-compte.tsx` | `captured` |
| `/terms` | `src/routes/terms.tsx` | `captured` |
| `/unsubscribe` | `src/routes/unsubscribe.tsx` | `captured` |
