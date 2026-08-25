import { Link } from "@tanstack/react-router";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

type LegalTone = "default" | "inverse";

export function LegalLinks({
  tone = "default",
  className,
}: {
  tone?: LegalTone;
  className?: string;
}) {
  const { t } = useI18n();
  const linkClass =
    tone === "inverse"
      ? "text-white/80 hover:text-white focus-visible:ring-white/70"
      : "text-[color:var(--text-secondary)] hover:text-foreground focus-visible:ring-[color:var(--brand-accent)]";

  return (
    <nav
      aria-label={t("legal.links.navigation")}
      className={cn("flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs", className)}
    >
      <Link
        to="/terms"
        className={cn(
          "rounded-md underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2",
          linkClass,
        )}
      >
        {t("legal.links.terms")}
      </Link>
      <span aria-hidden className={tone === "inverse" ? "text-white/35" : "text-muted-foreground"}>
        ·
      </span>
      <Link
        to="/privacy"
        className={cn(
          "rounded-md underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2",
          linkClass,
        )}
      >
        {t("legal.links.privacy")}
      </Link>
    </nav>
  );
}

export function LegalConsentNotice({
  mode = "continue",
  className,
}: {
  mode?: "accept" | "continue";
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span className={className}>
      {t(mode === "accept" ? "legal.consent.accept_prefix" : "legal.consent.continue_prefix")}{" "}
      <Link
        to="/terms"
        className="font-semibold text-[color:var(--brand-primary)] underline underline-offset-2"
      >
        {t("legal.links.terms")}
      </Link>{" "}
      {t("legal.links.and")}{" "}
      <Link
        to="/privacy"
        className="font-semibold text-[color:var(--brand-primary)] underline underline-offset-2"
      >
        {t("legal.links.privacy")}
      </Link>
      .
    </span>
  );
}
