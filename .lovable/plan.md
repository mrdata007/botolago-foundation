
# BotolaGO — Frontend Audit (read-only)

Scope: welcome/splash, root shell, home, news, matches, profile, fantasy hub/team/transfers/points/leagues/players/fixtures/rules/top-players, AppShell/TopBar/BottomNav/FantasySubNav, i18n/RTL, responsive, a11y, states, mocked interactions.

## Critical

1. **Splash icon asset is 20×20 rendered at 96×96 → visibly pixelated.**
   `file src/assets/botolago-splash-icon.png` confirms 20×20 RGBA. `SplashScreen.tsx` renders it via `<img class="h-24 w-24">` (~4.8× upscale). On any HiDPI screen the launch icon looks blurry/broken — the first frame the user sees. `public/favicon.png` already exists at 1024×1024 and would render perfectly. Recommend swapping the splash source to the 1024 asset (or reusing `<Logo variant="icon" />` which was the previous working state) and deleting `botolago-splash-icon.png`.

2. **`<html lang="en">` is hardcoded in `RootShell`, then patched client-side.**
   `src/routes/__root.tsx` renders `<html lang="en">`; `I18nProvider` updates `documentElement.lang/dir` only after mount. Result on first paint: wrong lang, missing `dir="rtl"` for Arabic users → FOUC of a mirrored layout, wrong font selection, wrong hyphenation. Any SEO crawler sees `en`. Should either read the stored preference via a synchronous inline script in the shell head, or accept a lang cookie server-side and inject it into `<html>` at render.

3. **`FirstLaunchLanguage` modal is mounted only inside `AppShell`.**
   Welcome screen (`WelcomeScreen`) does not include `AppShell`, and the splash covers the first ~900 ms, so the "first launch language selector" specified in the original brief never appears on the actual first launch — users land straight on the French welcome. Either move the modal to `RootComponent` (above `<Outlet />`) or render it on `WelcomeScreen` too.

## High

4. **Formation change is a visual no-op (documented in code).**
   `fantasy.team.tsx` `changeFormation()` comment: *"real reassignment of slots by position would go here."* The formation label updates and rows are sliced, but extra XI players are silently dropped from the render instead of being moved to bench and vice-versa. A user picking 3-4-3 from 4-4-2 loses a defender from view. Either implement slot reassignment against `FORMATIONS` config, or disable formation switching until it works.

5. **`fantasy.team.tsx` "Save" and Transfers "Confirm" are fake without any UI acknowledgement of that.**
   `save()` only clears editing state; `confirm()` shows a 2.4 s toast then resets. Because the mock service isn't updated, the "saved" squad reverts on next data refetch. This is fine for a prototype, but there is no `queryClient.setQueryData` optimistic write and no persistence to `localStorage` — the illusion breaks on any navigation. Add optimistic cache writes into the mock layer so the demo feels real.

6. **Home page renders `null` while resolving welcome state, then flashes content.**
   `HomePage` returns `null` for one paint after splash → visible white/gradient blink before Welcome or Home mounts. Combine with #2 to make first-run feel intentional (splash → welcome, no null frame).

7. **Sticky offsets are hardcoded and drift from the TopBar height.**
   - `news.tsx`: `sticky top-[4.5rem]`
   - `FantasySubNav.tsx`: `sticky top-16`
   The TopBar height depends on `env(safe-area-inset-top)` + padding, and on iPhone notches the sub-nav overlaps the TopBar (fantasy) or leaves a visible gap (news). Use a shared CSS custom property (e.g. `--topbar-offset`) set on the TopBar, or a single sticky wrapper.

8. **Hardcoded English string in fantasy edit hint.**
   `fantasy.team.tsx` line 260: `"Tap two players of the same position to swap."` bypasses the i18n dictionary. Verified as the only current leaked literal in the audited routes, but violates the "no hardcoded user-facing strings" rule.

9. **`aria-label` values on nav landmarks are not localized.**
   `BottomNav` `aria-label="Primary"` and `FantasySubNav` `aria-label="Fantasy sections"` are English. Arabic screen-reader users hear English landmark names.

10. **Home "Private leagues" and other secondary sections lack loading/empty/error branches.**
    `leaguesQ.data?.map`, `trendingQ.data?.map`, `followedNewsQ.data?.slice` render nothing while pending and expose no empty/error state. `matches` and `alerts` are the only sections that fully handle the four states. Inconsistent with the brief.

11. **Article surfaces read on tinted glass, not solid, in News list.**
    Brief says article reading surfaces should be mostly solid; `ArticleCard` (per its usage) currently sits on `bg-white/50` and the page also has multiple radial washes behind it. Contrast on the `matches` variant background falls close to WCAG AA for `text-muted-foreground` on translucent white. Prefer opaque `bg-card` for article and dense-table surfaces (matches league table already gets this right).

## Medium

12. **Fantasy MiniStat grid `grid-cols-4` overflows on 320–360 px screens.**
    Four tabular numbers plus uppercase labels wrap awkwardly. Use `grid-cols-2 sm:grid-cols-4`.

13. **PageBackground SVG arcs are absolutely positioned in a fixed viewBox (400×800), stretched with `preserveAspectRatio="xMidYMid slice"`.**
    On tall desktops the arcs move offscreen and the atmosphere flattens; on short landscape phones the arcs cut through the content. Consider a responsive positioning strategy or CSS-mask based blobs.

14. **`resolveVariant` only matches `/welcome` and `/auth` for the auth variant, but the welcome screen actually lives at `/` behind local state.**
    Not a runtime bug (Welcome passes `variant="auth"` explicitly), but the pathname-based mapping is misleading and any second entry point (e.g. a real `/auth` route later) will fight the state gate. Also, once auth is real, the home path can't stay coupled to unauthenticated state — needs a proper `_authenticated` layout.

15. **Transfers `pickerMaxPrice` calculation is opaque and off by cases.**
    The nested reducer swaps `outIds[i]` with `inIds` price by index, but reuses the *outer* `outIds`/`inIds` while filtering — for a second transfer where the first swap already moved money into bank, the max price can under- or over-count by the delta of the first pair. Extract a `computeAvailableBudget()` helper with unit tests via the validation module.

16. **Tap-to-swap in `fantasy.team.tsx` doesn't allow the documented bench↔XI same-position swap.**
    The block comment on `handleTap` promises "same position OR bench↔XI of same position" but the implementation only requires same position (fine) yet the shirt list is sliced to formation size (`defXi.slice(0, formationRow.def)`), so extra bench-eligible XI players never receive taps.

17. **Bottom nav active detection is prefix-based.**
    `pathname.startsWith("/fantasy")` also matches a future `/fantasy-…` slug. Low risk today but cheap to guard with `pathname === it.to || pathname.startsWith(it.to + "/")`.

18. **Splash uses `sessionStorage`, Welcome uses `localStorage`.**
    Splitting persistence keys is fine, but they aren't cleared coherently on language change or profile sign-out; add a `botolago.*` namespace utility to avoid stale flags surviving auth mode changes.

19. **Match card venue text is rendered outside the card at `text-[10px]`.**
    Below WCAG minimum comfortable size; also unlabeled (screen reader hears the venue with no context). Move inside the card and use `text-xs`.

20. **`h-screen`/`min-h-screen` in `AppShell` and error/notFound components should be `min-h-dvh` on mobile** to avoid the iOS URL bar bounce squeezing the bottom nav.

## Low

21. **News "Follow / Following" pill is inside the filter chip button** — nesting an interactive `<button>` inside an interactive `<button>` is invalid HTML and blocks keyboard focus on the inner one. Split into two adjacent buttons in a chip group.

22. **`Table` in Matches has no `<caption>`, and header text `"J"`, `"+/-"`, `"Pts"` is untranslated abbreviation.** Add localized `aria-label` or use `t("matches.table.*")` keys.

23. **`GameweekSelector` shown on Top Players — verify keyboard focus visibility.** Not read this pass; flag for the a11y sweep.

24. **`DropdownMenu` (LanguageSwitcher) `align="end"` doesn't flip on RTL.** shadcn Radix should handle logical alignment but `align="end"` freezes the anchor; consider omitting `align` or switching by `dir`.

25. **Motion**: page background blobs animate via `bgdrift` keyframes with `motion-reduce:animate-none` — good. Welcome uses `animate-in fade-in` with no `motion-reduce` override; Radix classes respect reduced-motion already, but the two custom springs on splash and welcome should be double-checked.

26. **CSS-only glass fallback** — I did not verify `@supports not (backdrop-filter)` rules in `styles.css`. Brief requires it; audit next pass.

## Recommended execution sequence

1. Splash icon fix (Critical #1) — 1 line, biggest perceived-quality win.
2. SSR `lang`/`dir` correctness + first-launch language modal placement (Critical #2, #3) — unblocks RTL day-one story.
3. Fantasy formation reassignment + tap-swap parity + optimistic mock persistence (High #4, #5, #16) — the demo currently misrepresents what works.
4. Sticky offset unification and MiniStat responsive grid (High #7, Medium #12) — cheapest visible polish.
5. Localize remaining strings and landmarks; add missing loading/empty/error states (High #8, #9, #10).
6. Article/table opacity pass to enforce solid reading surfaces (High #11).
7. Transfers budget helper + tests (Medium #15).
8. A11y sweep for tables, focus rings, motion, RTL dropdown flip (Medium/Low #19–#25).

## Single highest-value next milestone

**"Fantasy My Team" as a fully believable interactive demo**: swap the fake formation change, wire optimistic mock persistence for save/transfers, land the bench↔XI swap, fix the responsive MiniStat row, and localize the last hardcoded hint. This screen is the product's centerpiece and currently the most gap-heavy — one focused pass moves it from "looks right" to "feels right", which is what the backend team will build against.
