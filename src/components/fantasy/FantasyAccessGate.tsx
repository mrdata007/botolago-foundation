import { Link } from "@tanstack/react-router";
import { LogIn, ShieldCheck, UserPlus, Users } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

type ProtectedFantasyRoute =
  | "/fantasy"
  | "/fantasy/team"
  | "/fantasy/points"
  | "/fantasy/transfers"
  | "/fantasy/leagues";

export function FantasyAccessGate({
  next,
  compact,
}: {
  next: ProtectedFantasyRoute;
  compact?: boolean;
}) {
  const { t } = useI18n();

  return (
    <section
      aria-labelledby="fantasy-access-title"
      className={cn(
        "surface-4 relative overflow-hidden text-center",
        compact ? "p-4" : "px-5 py-8 sm:px-8 sm:py-10",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -end-16 -top-24 h-52 w-52 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand-accent) 30%, transparent), transparent 72%)",
          filter: "blur(8px)",
        }}
      />
      <div
        className="relative mx-auto grid h-12 w-12 place-items-center rounded-2xl text-white"
        style={{ backgroundImage: "var(--bg-brand-gradient)" }}
      >
        <ShieldCheck className="h-6 w-6" aria-hidden />
      </div>
      <h1
        id="fantasy-access-title"
        className={cn(
          "relative font-black text-foreground",
          compact ? "mt-3 text-lg" : "mt-4 text-2xl",
        )}
      >
        {t("auth.prompt.title")}
      </h1>
      <p className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-[color:var(--text-secondary)]">
        {t("auth.prompt.body")}
      </p>

      <div className="relative mx-auto mt-5 grid max-w-md gap-2 sm:grid-cols-2">
        <Link
          to="/auth/login"
          search={{ next }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl cta-brand px-4 text-sm font-black"
        >
          <LogIn className="h-4 w-4" aria-hidden />
          {t("auth.prompt.login")}
        </Link>
        <Link
          to="/auth/register"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[color:var(--surface)] px-4 text-sm font-bold text-foreground hover:bg-white"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {t("auth.prompt.register")}
        </Link>
      </div>

      <Link
        to="/fantasy/players"
        className="relative mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold text-[color:var(--brand-primary)] hover:bg-white/60"
      >
        <Users className="h-4 w-4" aria-hidden />
        {t("fantasy.tab.players")}
      </Link>
    </section>
  );
}
