// BotolaGO auth — the sign-in family, on the UI kit.
//
// OPTION A, DECISION 7: the light register. Login, register, verification,
// password reset, the MFA challenge, profile setup and the callback page used
// to sit on the full-screen dark mesh (`PageBackground variant="auth"`), with
// the form in a white card floating on it. They now read like the rest of the
// product: a short PHOTO BAND across the top — the brand moment, and the one
// part that keeps the dark register — and a white SHEET under it that carries
// the page's heading and its form directly, with no card inside the sheet.
// Welcome, the splash and the first-launch language chooser keep the mesh.
//
// The band. A stadium at night under an ink-deep scrim, `to bottom` (a degree
// angle would light the wrong edge in Arabic). On it: the back control, the
// wordmark, the language switcher — both kept although the board draws
// neither: the back control is how a reader who arrived from an email link
// leaves (`useBackTo`, pinned by `back-navigation.test.ts`), and the switcher
// is how an Arabic reader changes language before having an account — then
// the tagline in the display face and a strip of real club colours, resolved
// through the club palette like every other club colour on the page. Every
// foreground on it is the mesh register (`ui.tone.onMesh`, `ui.focusOnMesh`,
// the glass back button), so it stays legible in both themes: the band is
// dark whatever the theme is.
//
// The sheet. `--ui-surface` with the sheet radius on its two top corners,
// pulled 24px up over the band. It FOLLOWS the theme, which the old mesh never
// did: the auth screens were dark in both themes. The heading is
// `ui.display.title` (Changa 34/800), fields are `UiInput` in the filled look
// (`authFieldClass`, in `./auth-classes`), the primary action is the gradient
// pill.
//
// Desktop. The band and the sheet are one phone column, raised on the flat
// page with the column radius and shadow — the Fantasy frame's recipe — and
// centred in the viewport.
//
// House rules, as everywhere: logical properties only, every `tracking-*`
// `ltr:`-prefixed, colours from `--ui-*` tokens. The only literal hexes left
// in this file are Google's four-colour mark, which the design system exempts
// (§2.3).

import type { ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import stadiumPhoto from "@/assets/photos/stadium-night-800.webp";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { PageBackground } from "@/components/shell/PageBackground";
import { ui, UiBackButton, UiButton, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useBackTo } from "@/lib/back-navigation";
import { clubStyle } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import { AUTH_BAND_CLUBS } from "./account-model";
import { authOutlineClass } from "./auth-classes";

// The field, code-slot, outline and link recipes the screens compose live in
// `./auth-classes` — see the note there for why they are not exported here.

/**
 * The ink-deep veil over the band's photograph. Heavier at the two ends,
 * where the controls and the tagline sit, lighter through the middle where
 * the pitch shows. `to bottom`: a degree angle is physical (rule 3).
 */
const BAND_SCRIM =
  "linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 74%, transparent) 0%, color-mix(in oklab, var(--ui-ink-deep) 56%, transparent) 46%, color-mix(in oklab, var(--ui-ink-deep) 88%, transparent) 100%)";

/** Computed once: the palette is pure, and the strip never changes. */
const BAND_CLUB_STYLES = AUTH_BAND_CLUBS.map((club) => clubStyle(club));

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Rendered at the end of the sheet: the "no account yet?" line, the consent notice. */
  footer?: ReactNode;
  showBack?: boolean;
  /**
   * A shorter band — the wordmark row and the colour strip, no tagline — for
   * the screens a reader passes THROUGH (a code, a reset, the wizard, the
   * callback), where the form should start as high as it can. Login and
   * register, the two doors in, carry the full band.
   */
  compact?: boolean;
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  showBack = true,
  compact = false,
}: Props) {
  const { t } = useI18n();
  // Auth pages are linked to from email (confirmation, password reset) as often
  // as they are reached in-app, so home is the fallback rather than a listing.
  const goBack = useBackTo("/");

  return (
    <div className="relative min-h-[100dvh] w-full md:flex md:items-center md:justify-center md:px-6 md:py-10">
      {/* The flat page, as behind every product screen. On a phone the band
          and the sheet cover it; on desktop it frames the raised column. */}
      <PageBackground variant="neutral" />
      <div
        className={cn(
          "relative flex min-h-[100dvh] flex-col",
          ui.space.column,
          "md:min-h-0 md:overflow-hidden md:rounded-[var(--ui-radius-column)] md:shadow-[var(--ui-shadow-column)]",
        )}
      >
        <header
          className={cn(
            "relative isolate overflow-hidden",
            ui.tone.onMesh,
            // The last 24px sit under the sheet's rounded top.
            compact ? "pb-10" : "pb-11",
          )}
        >
          <img
            src={stadiumPhoto}
            alt=""
            aria-hidden
            decoding="async"
            fetchPriority="high"
            className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_58%]"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{ backgroundImage: BAND_SCRIM }}
          />
          <div className={cn(ui.space.gutter, ui.safe.top, "md:px-6 md:pt-5")}>
            <div className="flex min-h-[var(--ui-tap-min)] items-center gap-3">
              {showBack ? (
                // Glass, like any control on a photo: a wash of the plain
                // on-ink white under a white arrow, with a white focus ring.
                <UiBackButton onClick={goBack} label={t("auth.back")} tone="glass" iconOnly />
              ) : null}
              {/* The wordmark, not an icon tile beside "BotolaGO" typed in the
                  label style: this is the product naming itself. */}
              <Logo tone="light" size="sm" className="min-w-0" />
              <div className="ms-auto shrink-0">
                <LanguageSwitcher tone="onMesh" />
              </div>
            </div>
            {compact ? null : (
              // A 15rem measure breaks the line where the board does — after
              // "marocain," — in both languages, which gives the band its
              // height back without a size off the display ramp.
              <p className={cn("mt-10 max-w-60", ui.display.section)}>{t("auth.brand_tagline")}</p>
            )}
            <div aria-hidden className={cn("flex gap-1", compact ? "mt-5" : "mt-3")}>
              {BAND_CLUB_STYLES.map((club, index) => (
                <span
                  key={index}
                  data-club={club["data-club"]}
                  style={club.style}
                  className={cn("h-1 w-4", ui.radius.full, ui.club.fillOnly)}
                />
              ))}
            </div>
          </div>
        </header>

        <main
          className={cn(
            "relative z-10 -mt-6 flex flex-1 flex-col pt-6",
            "rounded-t-[var(--ui-radius-sheet)]",
            ui.surface.bar,
            ui.space.gutter,
            "pb-[max(env(safe-area-inset-bottom),1.5rem)] md:px-6 md:pb-8",
          )}
        >
          <h1 className={cn("text-balance", ui.display.title, ui.tone.default)}>{title}</h1>
          {subtitle ? (
            <p
              className={cn(
                "mt-1.5 text-pretty",
                ui.text.secondary,
                "[font-weight:var(--ui-weight-body)]",
                ui.tone.muted,
              )}
            >
              {subtitle}
            </p>
          ) : null}

          <div className="mt-6">{children}</div>

          {footer ? <div className="mt-6 grid gap-2">{footer}</div> : null}
        </main>
      </div>
    </div>
  );
}

/**
 * The show/hide-password eye, for `UiInput`'s `trailing` slot: the kit's
 * round ghost control, so it clears 44px inside the 48px field. Its name says
 * what pressing it will do, and changes with it.
 */
export function AuthPasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <UiIconButton
      variant="ghost"
      onClick={onToggle}
      aria-label={shown ? t("auth.hide_password") : t("auth.show_password")}
    >
      {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
    </UiIconButton>
  );
}

/** "ou continuer avec", sentence case between two hairlines, as the board sets it. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div
      className={cn(
        "my-1 flex items-center gap-3",
        ui.text.meta,
        "[font-weight:var(--ui-weight-strong)]",
        ui.tone.muted,
      )}
    >
      <span aria-hidden className="h-px flex-1 bg-[color:var(--ui-rule)]" />
      <span>{label}</span>
      <span aria-hidden className="h-px flex-1 bg-[color:var(--ui-rule)]" />
    </div>
  );
}

/** The page's one call to action: the action-gradient pill, lifted off the sheet. */
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

/**
 * The quiet pill on the sheet — "Continuer avec Google", "Retour à la
 * connexion": the kit's outline in `authOutlineClass`'s paint (a white pill,
 * on-surface text, a control edge). Apple's own button is the `ink` variant
 * instead (a filled navy pill), at its call sites.
 */
export function AuthSecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <UiButton variant="outline" {...props} className={cn(authOutlineClass, className)}>
      {children}
    </UiButton>
  );
}

/**
 * The reserved, politely-announced error line — for the surfaces that have no
 * `UiInput` to put it inside.
 *
 * Every text field in this family gets this behaviour from the kit
 * (`UiInput reserveError`). What is left is the two OTP screens, whose control
 * is the V1 `input-otp` component, and the callback page, whose message is
 * about the exchange rather than about a field. Both still need a region that
 * is mounted BEFORE the message exists — a live region created at the same
 * moment as its content is not reliably announced.
 *
 * The reservation is one line box of THIS text: the Arabic face runs the same
 * 13px on a 1.95 leading against 1.4, so a fixed 16px under-reserved it and
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

/** A form-level error on the sheet: a 14% negative tint behind negative text. */
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

/**
 * KEPT as literal hexes. This is Google's own four-colour "G": a third-party
 * brand mark this design system is not entitled to change, and no `--ui-*`
 * token matches it. The colour rule exempts brand marks (DESIGN_SYSTEM_V2
 * §2.3) — this is the exemption, not an oversight. It used to be drawn in
 * the red alone, which Google's sign-in branding does not allow.
 */
export function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="h-4.5 w-4.5" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z"
      />
      <path
        fill="#FBBC05"
        d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.9l-8 6.1C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

export function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden>
      <path
        fill="currentColor"
        d="M16.4 12.7c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.6-2-1.5-.2-2.9.9-3.7.9-.8 0-2-.9-3.2-.8-1.7 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.5 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.6-4.1zM14 5.5c.7-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.2 1.9-1 3 1 0 2-.6 2.7-1.4z"
      />
    </svg>
  );
}
