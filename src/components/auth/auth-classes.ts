import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The account family's class recipes, apart from `AuthShell.tsx` on purpose.
 *
 * `AuthShell` pulls the photo band with it (the stadium photograph, the logo,
 * the language switcher, the club palette). Profile, `/profile/security` and
 * the OAuth consent page need these recipes and none of that, and importing
 * the shell for a class string made each of them load the whole sign-in
 * screen. On the consent page it did worse than waste bytes: that route is
 * `ssr: false` and redirects a signed-out reader to `/auth/login` while it
 * hydrates, and with the shell already loaded the login screen rendered into
 * the server's empty shell — a hydration mismatch on every visit.
 * (`AuthShell.tsx` also exports components only, which fast refresh needs.)
 */

/**
 * The filled field of the sheet (A-Login): the page grey inside the white
 * sheet, the card radius, the row height, and an outline that must be seen —
 * `--ui-rule-strong` (≥ 3:1, WCAG 1.4.11) rather than the board's pale
 * hairline, which measured 1.3:1 and left the box invisible to low vision.
 *
 * A function because of the error state: `UiInput` paints an invalid field's
 * border in `--ui-negative`, and `fieldClassName` is merged AFTER it, so a
 * border colour here would silently win over the error. Pass the field's
 * invalid state and the outline steps aside.
 */
export function authFieldClass(invalid?: boolean) {
  return cn(
    ui.radius.card,
    "min-h-[var(--ui-row-min)] bg-[color:var(--ui-page)]",
    !invalid && "border-[color:var(--ui-rule-strong)]",
  );
}

/** A field's leading glyph (`UiInput leading`): decorative, muted, 18px. */
export const authFieldIconClass = cn("h-4.5 w-4.5", ui.tone.muted);

/**
 * The six-digit code slots, restyled from the call site.
 *
 * `auth.verify`, `auth.mfa-challenge` and `/profile/security` keep the V1
 * `input-otp` component: it owns the keyboard model (paste, per-slot focus,
 * backspace across slots), and rewriting that is a behaviour change, not a
 * restyle. Every class it draws a slot with is one this string is appended
 * after, so each is overridable here: the slots take the same filled look as
 * the fields — page grey, the strong outline, the card radius on the two
 * outer corners (the component already rounds them logically) — at the row
 * height, 44px wide. The digits take the stat ramp, because six boxed figures
 * are exactly the column rule 4 is about.
 *
 * The one V1 token with no prop path is the fake caret (`bg-foreground`),
 * drawn inside the slot by the component itself. It stays.
 */
export const authOtpSlotClass = cn(
  "h-[var(--ui-row-min)] w-[var(--ui-tap-min)]",
  ui.stat.md,
  "bg-[color:var(--ui-page)] text-[color:var(--ui-on-surface)]",
  "border-[color:var(--ui-rule-strong)] shadow-none",
  "first:rounded-s-[var(--ui-radius-card)] last:rounded-e-[var(--ui-radius-card)]",
  // The component draws `ring-1` only on the active slot, so this recolours
  // that ring and paints nothing on the others.
  "ring-[color:var(--ui-ink-fg)]",
);

/**
 * The quiet pill's paint, for `UiButton` / `UiLinkButton variant="outline"`.
 * The kit's `outline` draws its border in `currentColor` over brand-blue
 * text; the board's secondary is a white pill with on-surface text and a
 * control edge, which is the `--ui-rule-strong` recipe the foundation
 * documents for exactly this look.
 */
export const authOutlineClass =
  "border-[color:var(--ui-rule-strong)] bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)]";

/**
 * The link treatments the family composes inline, in one object so the
 * sheet's links are one decision rather than several.
 *
 * `consent` is the same treatment `ConsentLine` now uses by default: the
 * brand foreground (`--ui-ink-fg`), never `--brand-primary` — a fill colour
 * used as text (BG-0083).
 */
export const authLinkClass = {
  /**
   * A footer link on the sheet ("Créer un compte"): brand text, heavy,
   * underlined, and a 44px target although it reads as part of a sentence.
   */
  onSurface: cn(
    "inline-flex min-h-[var(--ui-tap-min)] items-center px-1",
    ui.radius.full,
    "[font-weight:var(--ui-weight-heavy)] underline decoration-[1.5px] underline-offset-4",
    ui.tone.ink,
    ui.focus,
  ),
  /** A legal link inside the consent sentence. */
  consent: cn(
    "[font-weight:var(--ui-weight-heavy)] underline underline-offset-2 hover:opacity-80",
    ui.tone.ink,
  ),
};
