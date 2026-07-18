
# BotolaGO — Remaining-Sequence Audit (read-only)

Verified in this pass: repo structure, all routes, services, `src/lib/*`, engine tests (44/44 pass), Supabase migrations directory (empty), Supabase client wiring, i18n dictionary size (958 lines), and targeted `grep` inspection of Fantasy Team/Transfers/Points to confirm which engine primitives are actually wired.

Legend: ✅ complete · 🟡 partial · ❌ missing · ⚠ risky

---

## Phase 1 — Visual system (selective BotolaGO blue)

- ✅ Utilities `.text-brand` / `.text-brand-accent` in `styles.css`; `Trans`, `AccentEyebrow`, `SectionHeader` primitives exist; ~15 routes updated in the last pass.
- 🟡 Coverage gaps likely on: `fantasy.rules.tsx`, `fantasy.fixtures.tsx`, `fantasy.top-players.tsx`, `fantasy.points.tsx`, `auth.profile-setup.tsx` — need a sweep to confirm eyebrows and accent words are applied consistently and not overused.
- 🟡 Loading/empty/error states: no shared `EmptyState` / `ErrorState` / skeleton primitives observed under `src/components/common/`; routes rely on ad-hoc conditionals.
- 🟡 Safe areas: `min-h-dvh` used in shell, but `env(safe-area-inset-*)` padding on `BottomNav` / `TopBar` should be spot-checked.
- ⚠ Systematic 320px/RTL/contrast sweep never formally executed — needs a checklist pass.

**DoD:** Every H1/H2 audited; shared `EmptyState`, `ErrorState`, `SkeletonCard` primitives; documented rules for when to tint; verified at 320/360/390 in FR + AR with Playwright screenshots.

## Phase 2 — Fantasy engine integration

Engine module `src/lib/fantasy-engine.ts` is implemented and unit-tested (chips, auto-subs, scoring, deadline). **Route integration is the gap.**

- ✅ `fantasy.team.tsx` uses `evaluateDeadline`, `canActivateChip`, chip state.
- 🟡 `fantasy.transfers.tsx` uses `splitTransfers` + `transferHit` and `team.freeTransfers`, but there is **no Wildcard / Free Hit branch** (grep returns 0 hits). Activating those chips from Team does not currently change transfer cost logic on the Transfers screen, and there is no Free Hit squad snapshot/restore wired on confirm.
- ❌ `fantasy.points.tsx` does **not** call `computeGameweekResult` or `applyAutoSubs` (grep returns 0 hits). Captain multiplier, vice takeover, auto-subs list, bench points, Triple Captain, Bench Boost, and transfer-hit deductions are rendered from mock fields rather than derived by the engine. This is the single biggest integration gap.
- 🟡 Deadline lock: enforced on Team, but Transfers "Confirm", chip activation on Points, and league join/leave are not verified to honor `isLocked`.
- ❌ Persistent gameweek results — chip usage history and per-GW scores are not persisted across reloads (only chip active-state via `fantasy-state.ts`).

**DoD:** Points screen fully derived from engine; Transfers respects Wildcard (no hits) and Free Hit (snapshot + auto-revert next GW); every mutation checks `isLocked`; results & chip history persisted via `storage.ts` (later Supabase).

## Phase 3 — Production backend foundation (Supabase)

- ✅ Lovable Cloud enabled; typed client `src/integrations/supabase/client.ts` present.
- ❌ `supabase/migrations/` is **empty**. No `profiles`, `user_preferences`, `fantasy_teams`, `squads`, `transfers`, `chips`, `gw_results`, `leagues`, `league_members`, `saved_articles`, `follows` tables exist.
- ❌ `src/services/auth.ts` is still `LocalMockAuthService`; `AuthProvider` does not consume `supabase.auth`.
- ⚠ Migration risk: local mock data lives in `localStorage` under namespaced keys (`storage.ts`, `leagues-store.ts`, `fantasy-state.ts`). A one-shot client-side migration on first authenticated login is required, otherwise users lose their team on cutover.
- ⚠ RLS: every new public table needs `GRANT` + policies scoped to `auth.uid()`; roles table required if admin/moderation is introduced later.

**DoD:** Full migration set with `GRANT` + RLS; typed regeneration; auth swapped to Supabase (email/password + Google via broker) with `_authenticated/route.tsx` gate; server functions replace mock services behind the same interfaces; one-time local→cloud migration on first login; demo seed migration.

## Phase 4 — Live football/news data

- ❌ No provider abstraction, no cache tables, no ingestion. `src/services/mock.ts` and `fantasy-mock.ts` are the only sources.
- **Design needed:** provider interface (fixtures, results, standings, clubs, players, injuries, stats, news), Supabase cache tables with `fetched_at`, `pg_cron` + `pg_net` scheduled server routes under `src/routes/api/public/hooks/*`, secret-driven activation with graceful mock fallback when credentials absent.

**DoD:** Providers behind a typed boundary; nightly + intra-day sync jobs; UI reads only from cache; mock fallback documented.

## Phase 5 — Chat portal

- ❌ Not started. No routes, tables, or realtime channels.
- **Needs:** `conversations`, `conversation_members`, `messages`, `reactions`, `reads`, `mutes`, `blocks`, `reports`; room kinds (DM, league, club, match); realtime via `supabase.channel`; auth gating; FR/AR/RTL; moderation queue.

**DoD:** Landing + all room types; realtime messages, replies, reactions, mentions, unread counts; mute/block/report + admin moderation view.

## Phase 6 — Social layer

- ❌ Missing. No comments, reactions, polls, follows, share, or activity feed.
- Depends on Phase 3 (auth + profiles) and Phase 4 (articles as first-class entities).

## Phase 7 — Notifications

- ❌ No in-app center, no unread count, no preferences, no event bus.
- **Design:** `notifications` table + `notification_preferences`; server-side emitters on match/news/fantasy/chat/social events; push-ready boundary (Web Push / FCM later) hidden behind a service.

## Phase 8 — Final production audit

- ✅ Typecheck currently clean; 44/44 tests pass.
- 🟡 No CI-style checklist yet: browser console cleanliness at each route, Playwright RTL screenshots, Lighthouse/perf pass, RLS lint, error boundaries on every route with a loader, 404/500 pages, sitemap/OG per route, badge visibility, publish settings.

---

## Recommended delivery order

Do phases in dependency order; do not start backend UI features before Phase 3 lands.

1. **Phase 2 (Fantasy engine wire-up)** — pure frontend, unblocks credibility of the flagship feature. Lowest risk, highest visible value. ~1 milestone.
2. **Phase 1 residuals (shared Empty/Error/Skeleton + 320px/RTL sweep)** — small, and makes Phase 3 UI states trivial. ~0.5 milestone.
3. **Phase 3 (Supabase auth + core tables + local→cloud migration)** — foundation for 4–7. Ship in two sub-milestones: (a) auth + profiles + preferences + saved/follows, (b) fantasy tables + leagues + results, each with migration, RLS, server fns, and swap-in. ~2 milestones.
4. **Phase 4 (data provider boundary + cache + cron)** — before social/chat, since articles and matches feed both. ~1.5 milestones.
5. **Phase 7 (notifications spine)** — needed by chat and social; land the table + service boundary before those features so events wire in directly. ~0.5 milestone.
6. **Phase 5 (chat)** — heaviest realtime feature; do after notifications. ~2 milestones.
7. **Phase 6 (social)** — layers cleanly once articles, follows, notifications exist. ~1 milestone.
8. **Phase 8 (final audit + publish)** — checklist, perf, RLS lint, publish. ~0.5 milestone.

## Cross-cutting risks

- **Local→Cloud migration** (Phase 3): design idempotent one-shot importer keyed off `localStorage` namespaces; wipe local keys only after server ACK.
- **RLS correctness** (Phase 3+): every table needs `GRANT` in the same migration; league membership policies must reference a `has_membership()` security-definer function to avoid recursive RLS.
- **Provider credentials absent** (Phase 4): must degrade to mock without route breakage.
- **Realtime cost** (Phase 5): subscribe in `useEffect` with cleanup; scope policies so subscribers only receive rows they may read.
- **Deadline lock coverage** (Phase 2): audit every mutation entry point, not just Team.
- **Google OAuth**: must use `lovable.auth.signInWithOAuth("google", …)` broker, and provider must be enabled via `supabase--configure_social_auth` in the same turn Supabase auth ships.

## Definition of done — global

Typecheck + all tests green; Playwright FR/AR screenshots at 320/390/1280 for every route; console clean; RLS lint clean; every route has `errorComponent` + `notFoundComponent`; local mock removed or clearly gated to demo mode; documented data provider fallback; publish settings reviewed.

---

**Nothing edited in this pass.** Ready to convert any single phase above into a concrete implementation plan on your signal — I suggest starting with Phase 2 (engine wire-up on Points + Transfers + deadline lock coverage) as the fastest high-leverage next milestone.
