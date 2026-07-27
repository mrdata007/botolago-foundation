## Goal

Make the blue brand gradient seen on the Fantasy card's "Voir mon équipe" button the standard look for **every primary call-to-action** across BotolaGO — Home, News, Matches, Fantasy, Profile, Auth, Onboarding — at the same intensity as today.

## Approach

One shared style, applied everywhere — no per-page copies of gradient CSS.

1. **Add a single reusable utility** in `src/styles.css`:
   - `@utility cta-brand` — gradient background (`--bg-brand-gradient`), white/primary-foreground text, rounded pill/2xl, `min-h-11` tap target, card→floating shadow on hover, subtle press translate, brand focus ring, disabled opacity.
   - It reproduces exactly the current Fantasy CTA look, so nothing changes visually on that button.

2. **Make it the default for the shared Button component** (`src/components/ui/button.tsx`):
   - The `default` variant adopts the gradient (the existing `premium` variant becomes an alias of it).
   - `secondary`, `outline`, `ghost`, `link`, `destructive` are untouched, so only true primary actions get the gradient.

3. **Convert the hand-rolled primary buttons** that currently use flat `bg-primary` or `bg-[var(--brand-primary)]` to the shared utility:
   - `src/routes/index.tsx` (Home CTA)
   - `src/routes/fantasy.index.tsx`, `fantasy.team.tsx`, `fantasy.transfers.tsx` (confirm transfers), `fantasy.points.tsx` (recompute / advance), `fantasy.create.tsx` (create-team primary step)
   - `src/routes/profile.tsx`
   - `src/components/shell/FirstLaunchLanguage.tsx`
   - `src/routes/__root.tsx` error/not-found actions
   - Auth screens (`auth.login`, `auth.register`, `auth.forgot-password`, `auth.update-password`, `auth.profile-setup`) — their submit buttons
   - Leave destructive (red), cancel/secondary, and chip/toggle buttons as they are.

4. **Keep everything else intact**: no copy changes, no i18n changes, RTL still works (logical properties only), all tap targets stay ≥44px.

## Verification

- Typecheck + full test suite (currently 212/212) must stay green.
- Visual pass on Home, News article, Matches, Fantasy hub/team/transfers/points/create, Profile, and Login in both FR and AR (RTL).

## Technical notes

The gradient token `--bg-brand-gradient` already exists in `src/styles.css`; the change is centralising its use rather than defining new colors. Gradient text contrast against `--primary-foreground` is unchanged from the current CTA, so contrast stays as-is.
