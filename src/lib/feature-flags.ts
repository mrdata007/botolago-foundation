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
 *   - `src/routes/profile.tsx` — the Light/Dark/System control
 *
 * Flip to `true` only when BG-0083 and BG-0084 are both closed.
 */
export const DARK_MODE_ENABLED = false;
