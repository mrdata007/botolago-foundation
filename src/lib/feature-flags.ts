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
