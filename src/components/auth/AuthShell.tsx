import type { ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { PageBackground } from "@/components/shell/PageBackground";
import { useI18n } from "@/i18n/provider";

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showBack?: boolean;
}

export function AuthShell({ title, subtitle, children, footer, showBack = true }: Props) {
  const { t, dir } = useI18n();
  const router = useRouter();
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
              onClick={() => router.history.back()}
              className="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-sm font-semibold text-white/85 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label={t("auth.back")}
            >
              <Arrow className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("auth.back")}</span>
            </button>
          ) : <span aria-hidden />}
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
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm leading-relaxed text-white/75">{subtitle}</p>
          )}
        </div>

        <div className="mt-6 flex-1">
          <div className="rounded-3xl bg-white/95 p-5 text-foreground shadow-2xl shadow-black/25 ring-1 ring-white/30">
            {children}
          </div>
        </div>

        {footer && <div className="mt-5 text-center text-sm text-white/80">{footer}</div>}
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

export function AuthPrimaryButton(
  { children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      {...props}
      className={
        "flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-primary)] px-5 text-sm font-bold text-white shadow-lg shadow-blue-950/20 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/50 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {children}
    </button>
  );
}

export function AuthSecondaryButton(
  { children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
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
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  );
}

export function AuthFieldError({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <p id={id} role="alert" aria-live="polite" className="mt-1 min-h-[16px] text-xs font-semibold text-destructive">
      {children ?? ""}
    </p>
  );
}

export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="font-bold text-white underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
