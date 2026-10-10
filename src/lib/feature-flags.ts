/**
 * Product feature flags — build-time constants, not runtime configuration.
 *
 * Each flag records a product decision, not a technical toggle. Keep them
 * boolean literals so the bundler can tree-shake the disabled branches and so
 * a reader can see the shipped state without tracing configuration.
 */

/**
 * News — ON since 2026-09-24.
 *
 * Owner decision, 2026-09-24: News is switched on. ElBotola licensed its
 * Botola Pro articles to BotolaGO (licence recorded on `app.publishers`), the
 * archive since 2021-09-23 was imported with ElBotola's own dates, and every
 * licensed article credits "Source : ElBotola" / "المصدر: البطولة" with a
 * link to the original. The owner also chose to have those articles indexed
 * and listed in the sitemap (see `src/lib/article-meta.ts` and migration
 * `20260924163000_news_sitemap_licensed.sql`).
 *
 * The history below is why it was off, and is kept because the gating it
 * describes still applies: every News surface still reads this constant.
 *
 * Owner decision, 2026-09-21 (BG-0091): News does not ship at launch. The 108
 * published articles were machine-ingested third-party link-out stubs, so the
 * surface carried third-party branding, bylines, hotlinked hero images and an
 * outbound "read the original" link, none of which belong in the end-user
 * product. The accompanying migration
 * (`supabase/migrations/20260921170000_news_stand_down.sql`) unpublishes them
 * and stops ingestion publishing, so every News read RPC returns an empty list
 * after promotion.
 *
 * This is a HIDE, not a deletion. The News routes, components and services
 * stay in the tree so the surface can be switched back on — by flipping this
 * one constant to `true` — if the owner licences content later. Every News
 * entry point in the product is gated on this constant; do not add ad-hoc
 * conditionals elsewhere.
 *
 * Gated surfaces (keep this list current):
 *   - `src/components/shell/primary-nav.ts` — the primary nav entry
 *   - `src/routes/news.tsx` + `src/routes/news.$articleId.tsx` — the routes
 *   - `src/routes/index.tsx` — Home news rail, "view all", discovery tile
 *   - `src/routes/fantasy.index.tsx` — Fantasy hub news rail + follow tile
 *   - `src/routes/profile.tsx` — saved-articles stat tile
 *   - `src/routes/matches.$matchId.tsx` — related-news section AND its fetch
 *   - `src/routes/clubs.$clubId.tsx` — the club's news fetch, and
 *     `src/components/clubs/ClubOverview.tsx` — the section it feeds
 *
 * That last one was missed when this list was first written, and the miss is
 * worth recording. The section renders on `related.length > 0`, and the feed
 * was empty because the stand-down migration had emptied it. A surface that
 * renders nothing because its DATA is gone looks exactly like a surface that
 * is gated — right up until someone publishes one article, which is precisely
 * what the News engine is being built to do. The cards link to
 * `/news/$articleId`, which redirects Home while this flag is false, so the
 * first approved article would have put a dead card on the match page of every
 * fixture involving either club. Emptiness is not a gate.
 *
 * There used to be a note here about a second surface the same review flagged:
 * the "news" tab on `src/routes/fantasy.players.$playerId.tsx`. It was never
 * gated on this flag and should not have been — it read `FantasyPlayer.news`,
 * an FPL-style availability blurb on the player record, which is not an
 * article, never touches `newsService` and links nowhere. It shared a word
 * with this flag and nothing else.
 *
 * The note also claimed nothing wrote that field. That was wrong: the mock
 * dataset populated it for injured, doubtful and suspended players, which is
 * exactly the "mock player news" the review described. Only the Supabase
 * repository never wrote it, so the tab was permanently empty against the real
 * backend and populated in mock mode — which is a worse defect than either
 * alone, because it looked fine wherever anyone was likely to check.
 *
 * The owner chose removal, so the tab, its three dictionary keys, the type
 * field and the mock blurbs are all gone. Nothing about it is gated here.
 */
export const NEWS_ENABLED = true;

/**
 * Dark mode — ON, following the phone's setting.
 *
 * Owner decision, 2026-10-05 (BG-0149): dark mode is switched on. The default
 * choice stays "system" (`DEFAULT_THEME_CHOICE`), so anyone whose phone is set
 * to dark sees BotolaGO dark from the first paint, and Profil > Apparence lets
 * them pick Clair, Sombre or Système. In dark the logo renders the existing
 * all-white files (`Logo` / `BrandedText` `tone="auto"`).
 *
 * History. It shipped OFF on 2026-09-21 (BG-0081) because two pre-existing
 * contrast defects would have greeted every dark-phone visitor:
 *
 *   - BG-0083: `--ui-ink`, a dark navy in BOTH themes, used as a text colour
 *     (Profile's h1 at 1.42:1 on dark). DONE: foregrounds use `--ui-ink-fg`,
 *     and BG-0149 cleared the last ring, dot and accent uses outside the kit
 *     (a source test now fails on any that come back).
 *   - BG-0084: Fantasy built on a light-only `--fpl-*` palette and literal
 *     `bg-white`. CLOSED on measurement: every `--fpl-*` token is now an alias
 *     of one `--ui-*` token (styles.css, pinned by `ui-kit.contract.test.ts`),
 *     no live code reads `--fpl-*` or `bg-white`, and BG-0149 measured the
 *     Fantasy routes in dark from rasterised pixels.
 *
 * The flag still gates the head script and the provider as well as the
 * control, and that is the part worth remembering: because the default is
 * "system", gating the control alone would still serve dark mode to every
 * dark-phone visitor. So this constant stays the one-line rollback switch —
 * set it to `false` and republish, and every visitor is back on light.
 *
 * Gated surfaces (keep this list current):
 *   - `src/routes/__root.tsx` — the inline pre-paint theme script
 *   - `src/theme/provider.tsx` — storage adoption, class application, OS listener
 *   - `src/routes/profile.tsx` — the whole "Apparence" row, label included
 */
export const DARK_MODE_ENABLED = true;

/**
 * Notification e-mail is really being sent — OFF.
 *
 * Owner decision, 2026-10-07 (critique plan "go", item P1): the interface
 * must not promise reminders or e-mails that nobody receives. Production
 * `app_private.notification_email_settings.mode` has been `off` since
 * 2026-10-04, so no match reminder, Fantasy deadline or recap e-mail and no
 * Pépites weekly e-mail goes out, and the in-app inbox, which the same tick
 * fills, very probably stays empty. The browser cannot read that setting
 * (`app_private`), so this constant mirrors it.
 *
 * Owner: turn this to `true` and republish when the notification e-mail mode
 * goes `live` (step 7 of "Switching it on" in
 * docs/backend/EMAIL_NOTIFICATIONS.md); leave it `false` in `test` mode,
 * where only the test accounts are e-mailed. Turn it back to `false` if the
 * mode goes back to `off` for more than a moment. If the phone app's push
 * alerts go live before e-mail, revisit it: the reminder bell feeds push too.
 *
 * This is a HIDE, not a deletion. With it on, every surface below renders
 * exactly as before; with it off they say plainly that reminders are not sent
 * yet, or are not drawn. Nothing reads or writes the stored preferences
 * differently either way. Components read it through
 * `useNotificationEmailLive()` (`src/lib/notification-email-live.ts`), so a
 * test can render both states; the app mounts no override, so this constant
 * decides.
 *
 * Gated surfaces (keep this list current):
 *   - `src/components/common/MatchCard.tsx` — the reminder bell on match rows
 *   - `src/components/pepites/PepitesHome.tsx` — the weekly e-mail card
 *   - `src/components/pepites/PepitesFollowButton.tsx` — the follow sheet's line
 *   - `src/routes/notifications.tsx` — the inbox's empty and sign-in copy
 *   - `src/routes/auth.profile-setup.tsx` — step 3's alert and e-mail boxes
 *   - `src/routes/profile.tsx` — the "Notifications n/3" row
 *   - `src/components/fantasy/FantasyHubPersonal.tsx` — the hub's e-mail
 *     reminder block and its placeholder
 *   - `src/components/pepites/admin/PepitesAdminEditions.tsx` — the "Publier
 *     maintenant" prompt
 */
export const NOTIFICATION_EMAIL_LIVE: boolean = false;

/**
 * Third-party OAuth sign-in — ON: Google and Apple are enabled.
 *
 * Checked 2026-10-07: production Supabase Auth's public settings
 * (`GET /auth/v1/settings`) report `google: true` and `apple: true`, so both
 * buttons lead to a working provider. The history below is why the flag
 * exists and is kept for that reason; it no longer describes production.
 *
 * BG-0111 (shipped OFF at launch). Signup and login rendered "Continuer avec
 * Google" and "Continuer avec Apple" against a project that had no OAuth
 * provider enabled at all. Probed directly against production auth then:
 *
 *   GET /auth/v1/authorize?provider=<p>
 *   -> {"error_code":"validation_failed",
 *       "msg":"Unsupported provider: provider is not enabled"}
 *
 * for google, apple, facebook, azure AND github. Every one of those buttons
 * was dead UI: a tap sent the visitor to an error page, from the two screens
 * where a failure costs the most.
 *
 * This is a HIDE, not a deletion, for the same reason as News: the owner may
 * enable Google later and should get the buttons back by flipping one
 * constant rather than rebuilding them. `authService.signInWithGoogle` /
 * `signInWithApple`, the `GoogleGlyph` / `AppleGlyph` marks and the
 * `auth.google` / `auth.apple` / `auth.or_continue_with` strings all stay.
 *
 * Keep it `true` only while a provider is enabled in Supabase Auth: set it
 * back to `false` if both are switched off, and prune the button list to the
 * providers that are on.
 *
 * Gated surfaces (keep this list current):
 *   - `src/routes/auth.login.tsx` — divider + provider buttons
 *   - `src/routes/auth.register.tsx` — divider + provider buttons
 *
 * Inside the phone app both are hidden whatever this says (`WebOnly`):
 * Google refuses sign-in in an embedded web view, and the provider's page
 * would open in the browser, which cannot hand the session back to the app.
 */
export const OAUTH_PROVIDERS_ENABLED = true;

/**
 * Fantasy prizes (public surfaces) — ON since 2026-09-24.
 *
 * Owner decision, 2026-09-24: the prize system shipped switched off, then the
 * owner switched it on the same day, once the three launch conditions held:
 *
 *   1. the prize T&Cs in `src/content/legal/prize-terms.ts` carry the owner's
 *      final text -- every `[TODO …]` span is replaced. The production build
 *      refuses to run while this flag is on and a span survives
 *      (`scripts/qa/legal-placeholder-gate.ts`);
 *   2. no sponsor is involved -- the organiser named in the T&Cs provides the prizes --
 *      so there is no sponsor sign-off to wait for (the owner dropped that
 *      condition). A sponsor added to a prize later needs naming in the T&Cs;
 *   3. `supabase/migrations/20260924120000_fantasy_prizes.sql` is on
 *      production (applied 2026-09-24 13:37 UTC, history version
 *      20260924133723).
 *
 * The flag hides what the public sees. It does not gate the admin console
 * (`/admin/prizes`, behind `prizes.manage`), where the catalog is managed, nor
 * winner selection, which the database only runs for a tier whose prize an
 * admin has switched on. The default prizes are seeded switched off; turning
 * them on is a database change, not this flag.
 *
 * Gated surfaces (keep this list current):
 *   - `src/routes/prizes.index.tsx` + `src/routes/prizes.terms.tsx` -- the routes
 *   - `src/routes/fantasy.index.tsx` -- the "Prizes" row and the first-visit popup
 *   - `src/lib/sitemap.ts` -- the /prizes entries
 *   - `scripts/qa/legal-placeholder-gate.ts` -- the prize T&Cs join the check
 */
export const PRIZES_ENABLED = true;

/**
 * Pronostics (score predictions, BG-0146) — the page exists; the database decides.
 *
 * Owner decision, 2026-09-24 (plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md
 * §15). Two build flags, and a third switch that is the real gate: the
 * database `mode` in `app_private.prediction_settings` (off / testers /
 * public), checked inside every Pronostics function. While it is `off`, or
 * while the viewer is not a tester, every read answers `allowed: false` and
 * the page shows "Bientôt disponible" under `noindex`. Before the Pronostics
 * migrations reach a database the functions do not exist, and the page shows
 * the same thing. So this flag can be on before launch: it reveals nothing
 * the database has not switched on, and it leaves Stage 3 a database switch
 * rather than a deploy.
 *
 * Gated surfaces (keep this list current):
 *   - `src/routes/pronostics.tsx` — the /pronostics routes (redirect Home when off)
 */
export const PRONOSTICS_ENABLED = true;

/**
 * Pronostics entry points — ON since 2026-09-25 (plan §15, Stage 5).
 *
 * Owner decision, 2026-09-25: "switch it on and publish it". The database
 * `mode` went to `public` at 14:56 UTC the same day, straight from `off`
 * (no testers stage).
 *
 * The ways in: the Home card and discovery tile, the Matches tab, the match
 * page card, the Fantasy league tab, the sitemap entry and search indexing.
 * The Home card and the match page card hide themselves while the database
 * `mode` is `off`; the Matches tab and the sitemap entry do not, so switching
 * the game off for more than a moment means turning this off again too.
 *
 * Gated surfaces (keep this list current):
 *   - `src/routes/pronostics.index.tsx` — `index,follow` instead of `noindex`
 *   - `src/lib/sitemap.ts` — the /pronostics entry
 *   - `src/routes/index.tsx` — the Home card, the one-tap "who wins" vote in the
 *     band's next-match panel, and the sixth discovery tile
 *   - `src/components/matches/MatchesTabs.tsx` — the "Pronostics" tab
 *   - `src/routes/matches.$matchId.tsx` — the "Votre pronostic" card
 *   - `src/routes/fantasy.leagues.$leagueId.tsx` — the league's "Pronostics" tab
 */
export const PRONOSTICS_PROMOTED = true;

/**
 * Audience measurement — ON since 2026-09-25 (BG-0146, plan §11).
 *
 * Owner decision, 2026-09-25: Seline, in place of the Plausible Analytics
 * chosen on 2026-09-24. The owner created the Seline project for botolago.com
 * and asked for its script on every page. Seline sets no cookie and keeps no
 * identifier on the phone, does not store IP addresses, and is hosted in the
 * EU. Page views plus five Pronostics events, names only, no identifiers.
 *
 * The script and the privacy policy's lines about it go live together, in one
 * release: this switch turns both on, and the policy took a new version and
 * date with them (1.2, 25 September 2026). Production builds on botolago.com
 * only: a development server, the Playwright suite, a preview deployment or
 * a local production build never sends anything.
 *
 * Gated surfaces (keep this list current):
 *   - `src/routes/__root.tsx` — the Seline script and the page views
 *   - `src/lib/analytics.ts` — `track()` sends nothing while off
 *   - `src/content/legal/documents.ts` — the processor row and the cookie
 *     clause of the privacy policy (with the sentence on a visitor's
 *     predictions kept on the phone), in French and Arabic
 */
export const ANALYTICS_ENABLED = true;

/**
 * Pépites public release approved by the owner on 2026-09-27.
 * Database off/staff/public access checks remain authoritative.
 * Set this false and republish for an application-level rollback.
 */
export const PEPITES_ENABLED: boolean = true;

/** Public navigation and indexing follow the application release switch. */
export const PEPITES_PROMOTED: boolean = PEPITES_ENABLED;

/**
 * Gradins (the Manager Card section) — OFF.
 *
 * Owner decision, 2026-10-08: a new section, Gradins, takes Pépites' place in
 * the main navigation and Pépites moves inside Fantasy, at the same moment.
 * It is built in the app behind this switch so that merging and publishing
 * change nothing anyone sees. Plan: docs/product/MANAGER_CARD_SECTION_PLAN.md.
 *
 * Two layers decide whether it shows:
 *   1. this build constant, which the owner flips in a one-line commit once
 *      the backend is applied (it can be flipped before the database switch);
 *   2. the database's own answer, `api.manager_card_status()`, read during the
 *      server render only. Off, missing, failing or slow all read as off.
 * Live = both. Set this false and republish for an application-level rollback;
 * turning the database read switch off hides the section without a republish.
 *
 * Gated surfaces (keep this list current):
 *   - `src/components/shell/primary-nav.ts` — the fifth slot, the Fantasy tab on /pepites
 *   - `src/routes/__root.tsx` — the server-side status read (beforeLoad)
 *   - `src/routes/gradins.tsx` — the /gradins routes (redirect to /fantasy when not live)
 *   - `src/routes/fantasy.index.tsx` — the Pépites tile, the card block
 *   - `src/components/pepites/PepitesHome.tsx` — the back pill to Fantasy
 *   - every inline card surface listed in the plan, section 5.1
 */
export const MANAGER_CARD_ENABLED: boolean = false;

/**
 * Development preview of Gradins: `VITE_MANAGER_CARD_PREVIEW=1` on a development
 * server only. `import.meta.env.DEV` is replaced by `false` in a production
 * build, so this is `false` there and every branch it guards is removed.
 *
 * The `typeof` guard is for code that imports this module outside Vite: the
 * Playwright runner (Node) loads it from `tests/e2e/pronostics.e2e.ts`, where
 * `import.meta.env` is undefined and reading `.DEV` would throw. In a build Vite
 * replaces `import.meta.env` with an object, so the guard folds to `true` and
 * the whole expression to `false`.
 */
export const MANAGER_CARD_PREVIEW: boolean =
  typeof import.meta.env !== "undefined" &&
  import.meta.env.DEV === true &&
  import.meta.env.VITE_MANAGER_CARD_PREVIEW === "1";

/** The build lets Gradins exist; the database status decides whether it shows. */
export const MANAGER_CARD_BUILD: boolean = MANAGER_CARD_ENABLED || MANAGER_CARD_PREVIEW;

/**
 * Home puts the Fantasy card first in the 24 hours before a Fantasy deadline
 * (a countdown-first variant of the phone layout). Off until the owner asks
 * for it: the match-first order stays the default.
 *
 * Gated surface: `src/routes/index.tsx` — the Fantasy section's order.
 */
export const HOME_DEADLINE_FIRST = false;

/**
 * Player-mapping PROPOSALS on /admin/football/player-mappings: ON since 2026-10-02.
 *
 * Owner decision, 2026-10-02: the reviewer screen was verified read-only on the
 * real page first (the queue of 1,004 candidates, the ranked options, no write
 * control while this was off). With this on, the screen draws the controls to
 * propose a pairing, and for a DIFFERENT qualified person to approve or reject
 * it. Proposing and approving create and decide a proposal only: nothing is
 * mapped by either. An approved proposal offers ONE explicit, typed execute
 * step (ExecuteMapping), which is the reviewed execute RPC and nothing else.
 *
 * The database authorises every one of those calls again (staff, MFA, recent
 * sign-in, `football.manage_mappings`, and, unless the owner's single-approver
 * switch is on (docs/backend/PLAYER_MAPPING_SINGLE_APPROVER_MODE.md), a
 * proposer who is never the approver), so this is an application-level brake,
 * not the authority. Set this false and republish to take the controls
 * away again; proposals already made stay as they are.
 *
 * Gated surfaces: `src/components/admin/player-mappings/PlayerMappingsScreen.tsx`.
 */
export const PLAYER_MAPPING_PROPOSALS_ENABLED: boolean = true;
