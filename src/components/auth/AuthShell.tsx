// BotolaGO auth — the sign-in surface, on the UI kit.
//
// DECISION: auth keeps a deliberate dark identity, but stops being a third
// design language.
//
// Sign-in, sign-up, verification and password reset are the one place in the
// product where the job is a single focused task and every other affordance
// is noise. A dark, quiet surface is a legitimate, widely used pattern for
// that, and `PageBackground`'s `auth` mesh is what these screens read their
// contrast from — converting them to the light page would flatten that intent
// for no gain.
//
// What was NOT legitimate was everything else that came with it: 12/16/20/24px
// radii, a type scale (`text-[13.5px]`, `text-[26px]`) that exists nowhere
// else, `bg-white/10` + `ring-white/20` + `backdrop-blur-md` glass, and
// `tracking-widest` with no `ltr:` prefix — which letter-spaced Arabic and
// broke the word (BG-0069). None of that is "a dark theme"; it is drift.
//
// So: the mesh stays, the chrome moves onto `--ui-*`. Radii are the kit's
// 6px control radius, type and weights come from the kit's scale, buttons are
// `UiButton`, spacing is the kit's gutter/tap/row tokens, and every colour is
// a token or a `color-mix` of one, including the on-dark text, which is
// `--ui-on-ink-plain` rather than a literal white. Same product, one focused
// room inside it.
//
// House rules, as everywhere: logical properties only, and every `tracking-*`
// is `ltr:`-prefixed (the kit's `ui.text.label` already is).
//
// SECOND PASS. The mesh register this file invented locally — an on-dark
// foreground and its two quieter steps, a glass tile, a focus ring that is not
// `ui.focus` because `--ui-ink-fg` is a navy ring on a navy mesh — is now IN
// the kit: `ui.tone.onMesh*`, `ui.surface.mesh`, `ui.focusOnMesh`, and
// `UiButton tone="onMesh"`. The four local constants that used to live here
// were the same `color-mix` recipes under private names, which is how two
// surfaces drift apart while both looking correct. They are gone; this file
// reads the tokens like every other screen.
//
// Gone with them: `authFieldClass` and `AuthFieldLabel`. Three things blocked
// these forms from `UiInput` and all three are fixed in the kit — the
// `trailing` slot holds the show/hide-password eye, `reserveError` reserves
// AND politely announces the error line (in one line box of the field's own
// type, which `AuthFieldError`'s `min-h-4` did not: the same 13px runs on a
// 1.95 leading in Arabic against 1.4 in French, so 16px under-reserved it by
// ~9px and the jump came back for Arabic readers), and `aria-describedby` is
// composed rather than replaced, so register's password field keeps pointing
// at both its error and its strength meter. Every form here is on `UiInput`
// now, all-or-nothing per form: a 13px sentence-case kit label beside a 12px
// uppercase one inside a single form looks worse than either alone.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { PageBackground } from "@/components/shell/PageBackground";
import { ui, UiButton, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useBackTo } from "@/lib/back-navigation";

/**
 * The six-digit code slots, restyled from the call site.
 *
 * `auth.verify` and `auth.mfa-challenge` keep the V1 `input-otp` component:
 * it owns the keyboard model (paste, per-slot focus, backspace across slots)
 * and rewriting that is a behaviour change, not a restyle. What it also owned
 * was a V1 slot — `h-9 w-9` (36px, under the 44px floor of rule 5), `text-sm`,
 * `border-input`, `shadow-sm`, `rounded-md` and a `ring-ring` focus ring —
 * and every one of those is a class the component appends OUR string after,
 * so each is overridable from here. The digits take the stat ramp, because six
 * boxed figures are exactly the column rule 4 is about.
 *
 * The one V1 token with no prop path is the fake caret (`bg-foreground`),
 * drawn inside the slot by the component itself. It stays.
 */
export const authOtpSlotClass = cn(
  "h-[var(--ui-tap-min)] w-[var(--ui-tap-min)]",
  ui.stat.md,
  "bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)]",
  "border-[color:var(--ui-rule)] shadow-none",
  "first:rounded-s-[var(--ui-radius-track)] last:rounded-e-[var(--ui-radius-track)]",
  // The component draws `ring-1` only on the active slot, so this recolours
  // that ring and paints nothing on the others.
  "ring-[color:var(--ui-ink-fg)]",
);

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showBack?: boolean;
}

export function AuthShell({ title, subtitle, children, footer, showBack = true }: Props) {
  const { t, dir } = useI18n();
  // Auth pages are linked to from email (confirmation, password reset) as often
  // as they are reached in-app, so home is the fallback rather than a listing.
  const goBack = useBackTo("/");
  const Arrow = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div className={cn("relative min-h-[100dvh] w-full overflow-x-hidden", ui.tone.onMesh)}>
      <PageBackground variant="auth" />
      <div
        className={cn(
          "relative z-10 flex min-h-[100dvh] flex-col",
          ui.space.column,
          ui.space.gutter,
          ui.safe.top,
          ui.safe.bottom,
        )}
      >
        <div className="flex items-center justify-between">
          {showBack ? (
            // `tone="onMesh"` is not decoration: a ghost button paints its text
            // in `--ui-ink-fg`, a deep navy, and draws its focus ring in the
            // same colour over a `--ui-page` offset — on this mesh that is a
            // control you cannot read with a ring you cannot see. That is why
            // this button used to be hand-rolled.
            <UiButton
              size="sm"
              variant="ghost"
              tone="onMesh"
              onClick={goBack}
              className={cn(
                "-ms-2 gap-1",
                "transition-colors hover:bg-[color:var(--ui-mesh-glass)]",
              )}
              aria-label={t("auth.back")}
            >
              <Arrow className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("auth.back")}</span>
            </UiButton>
          ) : (
            <span aria-hidden />
          )}
          <LanguageSwitcher tone="onMesh" />
        </div>

        {/* The wordmark, not an icon tile beside "BotolaGO" typed in the label
            style: this is the product naming itself. */}
        <div className="mt-4">
          <Logo tone="light" />
          <p className={cn("mt-2 truncate", ui.text.meta, ui.tone.onMeshMuted)}>
            {t("auth.brand_tagline")}
          </p>
        </div>

        <div className="mt-6">
          <h1 className={cn(ui.text.hero, ui.tone.onMesh)}>{title}</h1>
          {subtitle && (
            <p className={cn("mt-2 max-w-[36ch]", ui.text.prose, ui.tone.onMeshMuted)}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="mt-6 flex-1">
          <UiCard className={cn(ui.rule.all, "sm:p-5")}>{children}</UiCard>
        </div>

        {footer && (
          <div className={cn("mt-5 text-center", ui.text.body, ui.tone.onMeshMuted)}>{footer}</div>
        )}
      </div>
    </div>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className={cn("my-4 flex items-center gap-3", ui.text.label, ui.tone.muted)}>
      <span className="h-px flex-1 bg-[color:var(--ui-rule)]" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-[color:var(--ui-rule)]" />
    </div>
  );
}

export function AuthPrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <UiButton variant="gradient" {...props} className={className}>
      {children}
    </UiButton>
  );
}

export function AuthSecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <UiButton variant="outline" {...props} className={className}>
      {children}
    </UiButton>
  );
}

/**
 * The reserved, politely-announced error line — for the surfaces that have no
 * `UiInput` to put it inside.
 *
 * Every text field in this family now gets this behaviour from the kit
 * (`UiInput reserveError`). What is left is the two OTP screens, whose control
 * is the V1 `input-otp` component, and the callback page, whose message is
 * about the exchange rather than about a field. Both still need a region that
 * is mounted BEFORE the message exists — a live region created at the same
 * moment as its content is not reliably announced.
 *
 * The reservation is one line box of THIS text rather than the `min-h-4` it
 * used to be. 16px is the Latin line box; the Arabic face runs the same 13px
 * on a 1.95 leading against 1.4, so the old literal under-reserved by ~9px and
 * the layout jump the reservation exists to prevent came back for Arabic
 * readers. Same calc the kit's `reserveError` uses.
 */
export function AuthFieldError({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      aria-live="polite"
      className={cn(
        "mt-1 min-h-[calc(var(--ui-text-meta)*var(--ui-leading-flat))]",
        ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
        ui.tone.negative,
      )}
    >
      {children ?? ""}
    </p>
  );
}

/** A form-level error, inside the card. */
export function AuthFormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      aria-live="assertive"
      className={cn(
        "px-3 py-2",
        ui.radius.control,
        ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
        "bg-[color:color-mix(in_oklab,var(--ui-negative)_14%,transparent)]",
        ui.tone.negative,
      )}
    >
      {children}
    </p>
  );
}

export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        "[font-weight:var(--ui-weight-heavy)] underline-offset-4 hover:underline",
        ui.tone.onMesh,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * The two link treatments this family composes inline, in one object because
 * a link on the mesh and a link inside the card are the same decision made
 * twice — which register makes both of, six lines apart.
 *
 * `consent` exists because of what it replaces. `ConsentLine`'s default
 * `linkClassName` is `text-[color:var(--brand-primary)]`, and
 * `--brand-primary` is `--ui-ink`: a FILL colour used as a foreground, a deep
 * navy in both themes, measured 1.25:1 on dark. That is BG-0083 arriving
 * through a default argument rather than through a class written at the call
 * site, which is how it survived the first pass over these screens — nothing
 * in the file said `--brand-primary`. Every `ConsentLine` here now passes
 * this instead: `ui.tone.ink` is the theme-correct brand foreground
 * (`--ui-ink-fg`). The default itself lives in `src/components/legal`, which
 * is not this lane's to edit; other callers still inherit it.
 */
export const authLinkClass = {
  /** A footer link on the dark mesh. */
  onMesh: cn(
    "[font-weight:var(--ui-weight-heavy)] underline-offset-4 hover:underline",
    ui.tone.onMesh,
  ),
  /** A legal link inside the auth card. */
  consent: cn(
    "[font-weight:var(--ui-weight-heavy)] underline underline-offset-2 hover:opacity-80",
    ui.tone.ink,
  ),
};

/**
 * KEPT as a literal hex. `#EA4335` is Google's own sign-in mark: a
 * third-party brand colour this design system is not entitled to change, and
 * no `--ui-*` token matches it. The colour rule exempts brand marks
 * (DESIGN_SYSTEM_V2 §2.3) — this is the exemption, not an oversight.
 */
export function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4-5.5 4-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12S6.8 21.5 12 21.5c6.9 0 9.5-4.8 9.5-7.3 0-.5 0-.9-.1-1.4H12z"
      />
    </svg>
  );
}

export function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="currentColor"
        d="M16.4 12.7c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.6-2-1.5-.2-2.9.9-3.7.9-.8 0-2-.9-3.2-.8-1.7 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.5 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.6-4.1zM14 5.5c.7-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.2 1.9-1 3 1 0 2-.6 2.7-1.4z"
      />
    </svg>
  );
}
