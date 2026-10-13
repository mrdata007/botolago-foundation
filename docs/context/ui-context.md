# BotolaGO UI context

## Canonical source

src/styles.css is the source of truth for Design System V2. This document
describes how to use that system; it intentionally does not duplicate every
color value. If this document and the CSS differ, first determine whether the
CSS change was intentional, then reconcile both in the same unit.

## Visual language

BotolaGO is a premium, mobile-first Moroccan football product. Its core visual
language is deep navy and electric blue with cyan highlights, clean editorial
surfaces, restrained glass effects, stadium-inspired route meshes, bold
headlines, and dense-but-readable football data. The UI supports light and dark
surfaces. The Admin control plane is intentionally more utilitarian than the
consumer product.

Do not copy the colors, assets, wording, icons, CSS, or brand identity of FPL,
Sorare, or another product. Their interaction patterns may be studied only when
translated into BotolaGO's own system and requirements.

## Brand and semantic color tokens

Use semantic tokens rather than raw values.

| Token family | Representative variables                                             | Use                                      |
| ------------ | -------------------------------------------------------------------- | ---------------------------------------- |
| Brand        | --brand-primary, --brand-primary-2, --brand-accent, --brand-accent-2 | Navigation, CTA, selection, and emphasis |
| Base         | --background, --background-elevated, --background-muted              | Page and layered backgrounds             |
| Surface      | --surface, --surface-hover, --surface-selected, --surface-glass      | Cards, panels, and selection             |
| Text         | --text-primary, --text-secondary, --text-muted                       | Content hierarchy                        |
| Border       | --border-subtle, --border-strong                                     | Dividers, inputs, and containers         |
| State        | --color-live, --color-success, --color-warning, --color-danger       | Status only; never decorative ambiguity  |
| Accent       | --accent-cyan, --accent-indigo, --accent-emerald                     | Bounded category and data emphasis       |

The shadcn semantic contract maps background, foreground, card, popover,
primary, secondary, muted, accent, destructive, border, input, and ring to
these BotolaGO tokens. Feature code uses the semantic utility, not the raw
palette variable.

### Baseline design debt

The PR #123 launch candidate still contains hardcoded palette values in several
Atlas/Fantasy components. Treat those values as existing debt, not a convention:
do not copy them into new work and do not launch an unrelated global restyle.
Migrate a touched component only through an approved, bounded visual unit with
French/Arabic responsive regression evidence.

## Typography

| Context         | Font                                           | Usage                                    |
| --------------- | ---------------------------------------------- | ---------------------------------------- |
| French/Latin UI | Manrope with Inter/system fallback             | All consumer and staff Latin text        |
| Arabic UI       | Noto Sans Arabic with platform Arabic fallback | Arabic copy and numerals where localized |

- Headings use strong weight and compact tracking without sacrificing Arabic
  legibility.
- Body copy remains readable at mobile widths; muted text must retain contrast.
- Do not hard-code line-height assumptions that clip Arabic glyphs.
- French is the deterministic SSR language; Arabic is applied after persisted
  language hydration.

## Radius scale

| Context                   | Token               |
| ------------------------- | ------------------- |
| Chips and small controls  | --radius-control-sm |
| Buttons and inputs        | --radius-control    |
| Standard cards            | --radius-card       |
| Elevated cards            | --radius-card-lg    |
| Hero and summary surfaces | --radius-hero       |
| Bottom sheets             | --radius-sheet      |
| Dialogs                   | --radius-dialog     |

Use the component's semantic radius. Do not select arbitrary rounded classes
solely for decoration.

## Surface hierarchy

| Level         | Utility/pattern       | Use                                     |
| ------------- | --------------------- | --------------------------------------- |
| 1             | surface-1             | Base bounded section                    |
| 2             | surface-2             | Standard card                           |
| 2 interactive | surface-2-interactive | Pressable card with restrained feedback |
| 3             | surface-3             | Glass panel                             |
| 4             | surface-4             | Strong hero/summary glass               |
| 5             | surface-5             | Dialog or sheet                         |

Use glass effects sparingly and preserve readability when backdrop-filter is
unavailable. Use the named subtle, card, floating, navigation, and dialog shadow
tokens. The primary CTA uses cta-brand.

## Route backgrounds

Use the existing route-aware meshes:

- mesh-home
- mesh-news
- mesh-matches
- mesh-fantasy
- mesh-profile
- mesh-auth
- mesh-neutral

Meshes are atmospheric, not information-bearing. Motion is opt-in, slow, and
disabled under reduced-motion preferences.

## Layout patterns

### Application shell

- Mobile first and safe-area aware.
- Sticky glass top bar.
- Desktop primary navigation appears at the established md breakpoint.
- Mobile uses the fixed bottom navigation.
- Standard content is bounded near max-w-2xl.
- Fantasy and Admin workspaces may use the established max-w-5xl width.
- Page content must not disappear behind top or bottom navigation; use the
  topbar and bottomnav offset tokens.

### Primary navigation

The stable consumer destinations are Home, News, Fantasy, Matches, and Profile.
Do not add a sixth primary task without an approved navigation spec.

### Fantasy navigation

Primary Fantasy tasks are Hub, Team, Points, Transfers, and Leagues. Secondary
tasks live under More: Top Players, Rankings, Players, Fixtures, and Rules.
Creation routes are a focused journey and should not compete with normal
navigation.

### Auth

Auth uses the dark auth mesh, a focused max-w-md form surface, explicit
progress/recovery states, and a clear return to the interrupted safe route.

### Admin

Admin uses the shared typography and accessibility baseline with a distinct
dark slate/emerald operational tone. It prioritizes clear permission state,
risk, confirmation, and audit evidence over consumer decoration.

### Overlays

- Use Radix Dialog, Sheet, Popover, Select, Alert Dialog, or Drawer patterns as
  appropriate.
- Preserve focus trapping, Escape behavior, accessible titles/descriptions, and
  return focus.
- Mobile sheets must allow all content and actions to scroll into reach.

## Reusable component conventions

- Use shared Section and SectionHeader for editorial rhythm.
- Use ArticleCard, MatchCard, PlayerRow, Pitch, PlayerShirt, league/ranking
  components, and shared state components before creating variants.
- Use shadcn new-york primitives backed by Radix.
- Use Lucide stroke icons at established sizes.
- Decorative icons are aria-hidden; icon-only actions require an accessible
  label.
- Use Sonner for bounded transient feedback, not as the only record of a failed
  critical operation.

## Interaction and motion

- Preserve the existing duration tokens: tap, quick, route, sheet, and hero.
- Use press feedback only on interactive elements.
- Avoid layout-shifting hover effects.
- Every keyboard-interactive element has a visible focus ring.
- Touch actions use at least 44 by 44 pixels.
- Honor prefers-reduced-motion for animation and smooth scrolling.
- Live indicators may animate only when they remain understandable without
  animation.

## Localization and bidirectionality

- Every new or modified user-facing string and metadata value has matching
  French and Arabic dictionary keys.
- Known hardcoded French route/root metadata on the launch candidate is baseline
  debt, not a convention. Do not copy it; resolve it in approved localization
  scope before release certification.
- The root html lang and dir values follow the selected language after
  hydration.
- Prefer logical start/end spacing and alignment.
- Mirror directional arrows and chevrons where movement is directional.
- Do not mirror brand marks, charts, play icons, or non-directional status
  symbols.
- Check mixed Latin names, club abbreviations, dates, prices, and scores inside
  Arabic layouts.
- Keep number and score grouping visually stable in RTL.

## Accessibility

- Use semantic headings and landmarks in logical order.
- Forms require visible labels, field-level errors, summary/live feedback, and
  correct autocomplete where applicable.
- Loading, error, empty, locked, unavailable, conflict, and success states are
  announced appropriately.
- Color is never the only status signal.
- Dialogs and sheets have accessible name and description.
- Tables retain understandable headers or an equivalent small-screen structure.
- Images have meaningful alt text or empty alt when decorative.
- Test keyboard-only navigation, screen-reader names, 320-pixel width, and zoom.

## Data and state presentation

- Distinguish unknown, unavailable, zero, not started, live, provisional, final,
  corrected, and cancelled.
- Never turn a failed read into an empty success state.
- Never fabricate player photography, form, ownership, probability, or points.
- Fantasy success must follow the authoritative mutation response.
- Demo activity is always labelled Simulation/محاكاة and fictional managers are
  identified as such.
- Provider attribution and outbound-link behavior remain visible where required.

## Imagery and assets

- Use BotolaGO-owned assets and approved club/competition assets.
- Use real crests only through the validated asset contract.
- Keep opaque asset identifiers behind repositories and resolve approved URLs at
  the appropriate boundary.
- Do not hotlink or persist provider imagery without approved reuse rights.
- When player portrait rights are absent, use the approved crest/shirt/initial
  fallback rather than a fabricated portrait.

## Responsive verification

For a meaningful consumer UI change, verify at minimum:

- 320 pixels wide
- 390 by 844 mobile
- tablet width
- 1440 by 900 desktop
- French LTR
- Arabic RTL
- keyboard focus and reduced motion

Add route-specific widths when a spec identifies another risk.
