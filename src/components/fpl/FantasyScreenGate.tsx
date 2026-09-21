import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Loader2, LogIn, UserPlus } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { useI18n } from "@/i18n/provider";
import { FplButton } from "./primitives";
import type { FantasyScreenPhase, FantasyScreenState } from "./useFantasyScreen";

/**
 * Renders the non-ready phases of a Fantasy screen inside the screen's own
 * chrome so the header, back control and column stay identical to the ready
 * state. Loading is a bounded skeleton, errors always expose a retry, closed
 * seasons say so explicitly, guests get sign-in / register, and managers
 * without a team are sent to the squad builder.
 */
export function FantasyScreenGate({
  state,
  next,
  children,
  redirectNoTeam = true,
}: {
  state: FantasyScreenState;
  /** Protected route to resume after sign-in. */
  next: string;
  children: ReactNode;
  /** Whether "no_team" should redirect to the squad builder (default) or render the children. */
  redirectNoTeam?: boolean;
}) {
  const nav = useNavigate();
  const shouldRedirect = state.phase === "no_team" && redirectNoTeam;
  useEffect(() => {
    if (shouldRedirect) void nav({ to: "/fantasy/create", replace: true });
  }, [shouldRedirect, nav]);

  if (state.phase === "ready" || (state.phase === "no_team" && !redirectNoTeam)) {
    return <>{children}</>;
  }
  return <FantasyPhaseBody phase={state.phase} next={next} retry={state.retry} />;
}

export function FantasyPhaseBody({
  phase,
  next,
  retry,
}: {
  phase: FantasyScreenPhase;
  next: string;
  retry: () => void;
}) {
  const { t } = useI18n();
  if (phase === "loading" || phase === "no_team") {
    return (
      <div role="status" aria-label={t("state.loading")} className="px-4 py-6">
        <div className="mx-auto mb-4 flex items-center justify-center gap-2 text-[13px] font-semibold text-[color:var(--fpl-grey-text)]">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {t("state.loading")}
        </div>
        <div className="space-y-3">
          <div className="h-12 rounded-md bg-white shadow-sm" />
          <div className="h-[420px] rounded-md bg-[color:var(--fpl-pitch-a)]/40" />
          <div className="h-24 rounded-md bg-white shadow-sm" />
        </div>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div role="alert" className="mx-4 my-6 rounded-md bg-white p-5 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-7 w-7 text-[color:var(--fpl-pink)]" aria-hidden />
        <h2 className="mt-3 text-[17px] font-extrabold text-foreground">{t("fpl.error.title")}</h2>
        <p className="mt-1 text-[14px] text-[color:var(--fpl-grey-text)]">{t("fpl.error.body")}</p>
        <FplButton variant="ink" className="mt-4" onClick={retry}>
          {t("state.retry")}
        </FplButton>
      </div>
    );
  }
  if (
    phase === "season_closed" ||
    phase === "awaiting_gameweek" ||
    phase === "registration_closed"
  ) {
    return (
      <div role="status" className="mx-4 my-6 rounded-md bg-white p-5 text-center shadow-sm">
        <CalendarClock className="mx-auto h-7 w-7 text-[color:var(--fpl-ink)]" aria-hidden />
        <h2 className="mt-3 text-[17px] font-extrabold text-foreground">
          {t(`fantasy.availability.${phase}.title`)}
        </h2>
        <p className="mt-1 text-[14px] text-[color:var(--fpl-grey-text)]">
          {t(`fantasy.availability.${phase}.body`)}
        </p>
        <FplButton
          variant="light"
          className="mt-4 ring-1 ring-[color:var(--fpl-grey)]"
          onClick={retry}
        >
          {t("state.retry")}
        </FplButton>
      </div>
    );
  }
  // guest
  return (
    <div className="mx-4 my-6 rounded-md bg-white p-5 text-center shadow-sm">
      <h2 className="text-[17px] font-extrabold text-foreground">{t("auth.prompt.title")}</h2>
      <p className="mt-1 text-[14px] text-[color:var(--fpl-grey-text)]">{t("auth.prompt.body")}</p>
      <div className="mt-4 grid gap-2">
        <Link
          to="/auth/login"
          search={{ next }}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] px-4 text-[15px] font-extrabold text-[color:var(--fpl-ink)]"
          style={{ backgroundImage: "var(--fpl-grad)" }}
        >
          <LogIn className="h-4 w-4" aria-hidden />
          {t("auth.prompt.login")}
        </Link>
        <Link
          to="/auth/register"
          search={{ next }}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[color:var(--fpl-ink)] px-4 text-[15px] font-extrabold text-white"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {t("auth.prompt.register")}
        </Link>
      </div>
    </div>
  );
}
