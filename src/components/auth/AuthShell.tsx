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

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { PageBackground } from "@/components/shell/PageBackground";
import { ui, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useBackTo } from "@/lib/back-navigation";

/** Text on the dark mesh, and its two quieter steps. */
const onMesh = "text-[color:var(--ui-on-ink-plain)]";
const onMeshMuted = "text-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_78%,transparent)]";
const onMeshFaint = "text-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_62%,transparent)]";
/** Focus ring for controls sitting on the mesh rather than on the page. */
const focusOnMesh =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-on-ink-plain)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

/**
 * The shared field class for every auth input: the kit's control radius,
 * hairline rule, surface and type scale, at a ≥44px tap height.
 */
export const authFieldClass = cn(
  "w-full px-3 py-3 outline-none",
  "min-h-[var(--ui-row-min)]",
  ui.radius.control,
  ui.rule.all,
  "bg-[color:var(--ui-surface)]",
  ui.text.body,
  ui.tone.default,
  "focus:border-[color:var(--ui-ink)]",
  ui.focus,
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
    <div className={cn("relative min-h-[100dvh] w-full overflow-x-hidden", onMesh)}>
      <PageBackground variant="auth" />
      <div
        className={cn(
          "relative z-10 mx-auto flex min-h-[100dvh] w-full flex-col",
          "max-w-[var(--ui-column-max)]",
          ui.space.gutter,
          ui.safe.top,
          ui.safe.bottom,
        )}
      >
        <div className="flex items-center justify-between">
          {showBack ? (
            <button
              type="button"
              onClick={goBack}
              className={cn(
                "inline-flex items-center gap-1 -ms-2 px-2",
                ui.space.tap,
                ui.radius.control,
                ui.text.body,
                onMeshMuted,
                "transition-colors hover:bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_12%,transparent)]",
                focusOnMesh,
              )}
              aria-label={t("auth.back")}
            >
              <Arrow className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("auth.back")}</span>
            </button>
          ) : (
            <span aria-hidden />
          )}
          <LanguageSwitcher />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div
            className={cn(
              "grid h-12 w-12 shrink-0 place-items-center p-1.5",
              ui.radius.control,
              "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_12%,transparent)]",
              "border border-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_22%,transparent)]",
            )}
          >
            <Logo variant="icon" className="!h-9 !w-9 !rounded-[var(--ui-radius-control)]" />
          </div>
          <div className="min-w-0">
            {/* `ui.text.label` letter-spaces Latin only — Arabic joins (BG-0069). */}
            <div className={cn(ui.text.label, onMeshFaint)}>BotolaGO</div>
            <div className={cn("truncate", ui.text.meta, onMeshMuted)}>
              {t("auth.brand_tagline")}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h1 className={cn(ui.text.hero, onMesh)}>{title}</h1>
          {subtitle && (
            <p className={cn("mt-2 max-w-[36ch] leading-relaxed", ui.text.body, onMeshMuted)}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="mt-6 flex-1">
          <div className={cn(ui.surface.card, ui.rule.all, "p-4 sm:p-5")}>{children}</div>
        </div>

        {footer && (
          <div className={cn("mt-5 text-center", ui.text.body, onMeshMuted)}>{footer}</div>
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

export function AuthFieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1 block", ui.text.label, ui.tone.muted)}>
      {children}
    </label>
  );
}

export function AuthFieldError({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      aria-live="polite"
      className={cn(
        "mt-1 min-h-4",
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
        onMesh,
      )}
    >
      {children}
    </Link>
  );
}

/** The class a footer link on the mesh uses when it is composed inline. */
export const authMeshLinkClass = cn(
  "[font-weight:var(--ui-weight-heavy)] underline-offset-4 hover:underline",
  onMesh,
);

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
