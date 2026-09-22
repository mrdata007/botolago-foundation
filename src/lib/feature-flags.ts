/**
 * Product feature flags — build-time constants, not runtime configuration.
 *
 * Each flag records a product decision, not a technical toggle. Keep them
 * boolean literals so the bundler can tree-shake the disabled branches and so
 * a reader can see the shipped state without tracing configuration.
 */

/**
 * News — OFF at launch.
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
 * NOT gated, deliberately: the "news" tab on
 * `src/routes/fantasy.players.$playerId.tsx`. It reads `FantasyPlayer.news`,
 * an FPL-style availability blurb on the player record — not an article. It
 * never touches `newsService` and links nowhere; it shares a word with this
 * flag and nothing else. (It is dead for an unrelated reason: nothing in the
 * codebase writes that field, so the tab always renders its empty state.
 * Tracked separately — gating it here would hide a Fantasy feature behind a
 * News flag.)
 */
export const NEWS_ENABLED = false;

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
export const OAUTH_PROVIDERS_ENABLED = false;
