import { useNavigate } from "@tanstack/react-router";
import { CalendarClock, Loader2, LogIn, UserPlus } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import {
  ui,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiLinkButton,
  UiSkeleton,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { FantasyScreenPhase, FantasyScreenState } from "./useFantasyScreen";

/**
 * Renders the non-ready phases of a Fantasy screen inside the screen's own
 * chrome so the header, back control and column stay identical to the ready
 * state. Loading is a bounded skeleton, errors always expose a retry, closed
 * seasons say so explicitly, guests get sign-in / register, and managers
 * without a team are sent to the squad builder.
 *
 * The phases are the kit's state shapes now. Each one used to be a hand-rolled
 * block on a literal `bg-white` card with `--fpl-*` copy colours, which is
 * the single place a Fantasy screen is most likely to be seen in dark mode —
 * a slow or failed request — and the one that read worst there.
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
    // The Fantasy layout is known in advance — a header row, the pitch block
    // and a summary row — so it is skeletoned at those proportions rather
    // than replaced by a spinner.
    return (
      <div role="status" aria-label={t("state.loading")} className={cn("py-6", ui.space.gutter)}>
        <div
          className={cn(
            "mx-auto mb-4 flex items-center justify-center gap-2",
            ui.text.meta,
            ui.tone.muted,
          )}
        >
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {t("state.loading")}
        </div>
        <div className="space-y-3">
          <UiSkeleton className="h-12" />
          <UiSkeleton className="h-[420px]" />
          <UiSkeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <UiErrorState
        className="mx-4 my-6"
        title={t("fpl.error.title")}
        body={t("fpl.error.body")}
        onRetry={retry}
      />
    );
  }

  if (phase === "season_closed" || phase === "awaiting_gameweek") {
    return (
      // `UiEmptyState`, not `UiStatePanel kind="empty"` — the kit prefers the
      // named states because they say what they are, and this renders the
      // identical panel.
      <UiEmptyState
        className="mx-4 my-6"
        title={
          <span className="flex flex-col items-center gap-3">
            <CalendarClock className={cn("h-7 w-7", ui.tone.ink)} aria-hidden />
            {phase === "season_closed"
              ? t("fantasy.availability.season_closed.title")
              : t("fantasy.availability.awaiting_gameweek.title")}
          </span>
        }
        body={
          phase === "season_closed"
            ? t("fantasy.availability.season_closed.body")
            : t("fantasy.availability.awaiting_gameweek.body")
        }
        onRetry={retry}
      />
    );
  }

  // Guest. Deliberately NOT `UiEmptyState`, although it has the same shape —
  // a centred card, a heading, a line of body copy, actions. The kit's state
  // panels wrap their content in `role="status"`, because an empty or failed
  // fetch is news about the screen. This is not: the screen loaded, and this
  // is its content — an invitation to sign in. Rendering it as a status would
  // add a live-region announcement that is not there today, and the brief for
  // a design migration is that the announcements do not change.
  return (
    <UiCard padding="lg" className="mx-4 my-6 text-center">
      <h2 className={cn(ui.text.section, ui.tone.default)}>{t("auth.prompt.title")}</h2>
      <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("auth.prompt.body")}</p>
      <div className="mt-4 grid gap-2">
        <UiLinkButton to="/auth/login" search={{ next }} variant="gradient">
          <LogIn className="h-4 w-4" aria-hidden />
          {t("auth.prompt.login")}
        </UiLinkButton>
        <UiLinkButton to="/auth/register" search={{ next }} variant="ink">
          <UserPlus className="h-4 w-4" aria-hidden />
          {t("auth.prompt.register")}
        </UiLinkButton>
      </div>
    </UiCard>
  );
}
