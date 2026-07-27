## Goal

Replace the current splash (small icon on a flat navy gradient) with a dark cinematic brand moment that shows the **full BotolaGO wordmark**, not just the ball icon. Background stays deep navy — never white.

## Why the wordmark isn't used today

`Logo.tsx` renders the brand wordmark from a **JPG** (`botolago-logo.jpg`), which has a baked-in white background. Dropping it on the navy splash would show a white rectangle, which is why the splash currently uses the icon-only PNG.

## Steps

**1. Transparent wordmark asset**
Derive a transparent-background PNG of the BotolaGO wordmark from the existing logo (background removed, blue mark kept intact). Saved as a new asset used only where the logo sits on dark surfaces. The existing header logo is untouched.

**2. Rebuild `SplashScreen.tsx` — dark cinematic**
- Deep navy base with a subtle mesh/radial glow behind the mark (brand blue at low opacity, plus a warm-free cool highlight top-left).
- Full wordmark centered, fading up with a small scale (0.97 → 1) and a **light sweep** that travels once across the letterforms.
- Thin brand-blue accent bar beneath the wordmark that draws from center outward as the loading beat.
- Faint stadium-arc line motif at very low opacity for depth, consistent with the app's background system.
- Exit: whole layer fades and lifts slightly, revealing the app.

**3. Timing**
~1100ms total (hold ~800ms + 350ms fade), long enough for the sweep to read. `prefers-reduced-motion`: no sweep, no scale — straight fade at ~450ms total.

**4. Correctness details**
- Keep the existing `LaunchGate` contract (`onDone`) and once-per-session behavior — no changes to root gating logic.
- No hardcoded color utilities: colors come from DS V2 tokens / inline brand gradient values already in use.
- `alt="BotolaGO"`, `aria-hidden` on exit, no layout shift, no scrollbar flash.
- Direction-agnostic (centered), so RTL is unaffected.

## Verification

Screenshot the splash mid-animation and at exit in both FR and AR, confirm no white flash between splash and app, and run typecheck + the test suite.
