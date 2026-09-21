import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { PageBackground } from "@/components/shell/PageBackground";
import { useI18n } from "@/i18n/provider";
import { useBackTo } from "@/lib/back-navigation";

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
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden text-white">
      <PageBackground variant="auth" />
      <div
        className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 1rem)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)",
        }}
      >
        <div className="flex items-center justify-between">
          {showBack ? (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-sm font-semibold text-white/85 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20 backdrop-blur-md">
            <Logo variant="icon" className="!h-9 !w-9 !rounded-xl" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/60">
              BotolaGO
            </div>
            <div className="truncate text-[13px] text-white/70">{t("auth.brand_tagline")}</div>
          </div>
        </div>

        <div className="mt-6">
          <h1 className="text-2xl font-black tracking-tight sm:text-[26px]">{title}</h1>
          {subtitle && (
            <p className="mt-2 max-w-[36ch] text-[13.5px] leading-relaxed text-white/80">
              {subtitle}
            </p>
          )}
        </div>

        <div className="mt-6 flex-1">
          <div
            className="rounded-[24px] bg-white/97 p-5 text-foreground ring-1 ring-white/40 sm:p-6"
            style={{
              boxShadow:
                "0 24px 60px -24px rgba(3, 12, 40, 0.55), 0 2px 8px -2px rgba(3, 12, 40, 0.18)",
            }}
          >
            {children}
          </div>
        </div>

        {footer && <div className="mt-5 text-center text-sm text-white/85">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function AuthPrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl cta-brand px-5 text-sm font-bold shadow-lg shadow-blue-950/20 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/50 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {children}
    </button>
  );
}

export function AuthSecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-input bg-white px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40"
      }
    >
      {children}
    </button>
  );
}

export function AuthFieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
    >
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
      className="mt-1 min-h-[16px] text-xs font-semibold text-destructive"
    >
      {children ?? ""}
    </p>
  );
}

export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-bold text-white underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

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
