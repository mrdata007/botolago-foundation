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
 * Dark mode — OFF at launch.
 *
 * Owner decision, 2026-09-21 (BG-0081): the theme machinery ships, the control
 * does not. Two contrast defects have to close first, both pre-existing and
 * both bigger than this feature:
 *
 *   - BG-0083: `--ui-ink` is used as a text colour across the product. It is a
 *     dark navy in BOTH themes, so on a dark surface Profile's h1 measures
 *     1.42:1 and the BottomNav active label and UiButton outline/ghost 1.25:1.
 *   - BG-0084: Fantasy has no `.dark` counterpart at all. It is built on
 *     `--fpl-*`, which styles.css documents as a light-only reconstruction,
 *     plus literal `bg-white`. Themed foregrounds land on un-themed light
 *     surfaces and three labels measure 1.01:1 — invisible.
 *
 * Gating the control alone would NOT have been enough, and this is the part
 * worth remembering: DEFAULT_THEME_CHOICE is "system", so with the inline head
 * script live every visitor whose OS prefers dark would have been served dark
 * mode immediately, toggle or no toggle, straight into those two defects. The
 * flag therefore gates the head script and the provider's effects as well as
 * the control.
 *
 * Gated surfaces (keep this list current):
 *   - `src/routes/__root.tsx` — the inline pre-paint theme script
 *   - `src/theme/provider.tsx` — storage adoption, class application, OS listener
 *   - `src/routes/profile.tsx` — the whole "Apparence" row, label included
 *
 * Flip to `true` only when BG-0083 and BG-0084 are both closed.
 */
export const DARK_MODE_ENABLED = false;

/**
 * Third-party OAuth sign-in — OFF at launch.
 *
 * BG-0111. Signup and login rendered "Continuer avec Google" and "Continuer
 * avec Apple" against a project that has no OAuth provider enabled at all.
 * Probed directly against production auth:
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
 * Flip to `true` only once a provider is actually enabled in Supabase Auth,
 * and prune the button list here to the providers that are.
 *
 * Gated surfaces (keep this list current):
 *   - `src/routes/auth.login.tsx` — divider + provider buttons
 *   - `src/routes/auth.register.tsx` — divider + provider buttons
 */
export const OAUTH_PROVIDERS_ENABLED = true;

/**
 * Fantasy prizes (public surfaces) — OFF until launch.
 *
 * Owner decision, 2026-09-24: the sponsor-funded prize system ships switched
 * off. Three things must be true before this becomes `true`:
 *
 *   1. the prize T&Cs in `src/content/legal/prize-terms.ts` carry the owner's
 *      final legal text -- every `[TODO …]` span is replaced. The production
 *      build refuses to run while this flag is on and a span survives
 *      (`scripts/qa/legal-placeholder-gate.ts`);
 *   2. the sponsor has signed off on the catalog shown on the page;
 *   3. `supabase/migrations/20260924120000_fantasy_prizes.sql` has been promoted
 *      to production through the reviewed migration path.
 *
 * The flag hides what the public sees. It does not gate the admin console
 * (`/admin/prizes`, behind `prizes.manage`), which is how the catalog is
 * prepared before launch, nor winner selection, which the database only runs
 * for a tier whose prize an admin has switched on -- and the default prizes
 * are seeded switched off.
 *
 * Gated surfaces (keep this list current):
 *   - `src/routes/prizes.index.tsx` + `src/routes/prizes.terms.tsx` -- the routes
 *   - `src/routes/fantasy.index.tsx` -- the "Prizes" row and the first-visit popup
 *   - `src/lib/sitemap.ts` -- the /prizes entries
 *   - `scripts/qa/legal-placeholder-gate.ts` -- the prize T&Cs join the check
 */
export const PRIZES_ENABLED = false;
