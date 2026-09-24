import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import type { MyLeaguesDto } from "@/backend/predictions/contracts";
import type { PredictionsError } from "@/backend/predictions/errors";
import { useAuth } from "@/auth/AuthProvider";
import { pointsLabel } from "@/components/matches/standings-copy";
import {
  ui,
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { predictionsService } from "@/services/predictions";
import { formatNumber } from "../predictions-copy";
import { CreateLeagueForm } from "./CreateLeagueForm";
import { JoinLeagueForm } from "./JoinLeagueForm";
import { membersLabel } from "./leagues-copy";

/**
 * The "Ligues" tab: the reader's leagues through either game, joining with a
 * code, creating one. A visitor is asked to sign in: guests cannot be members.
 */
export function LeaguesPanel() {
  const { t, lang } = useI18n();
  const { status, user, requireAuth } = useAuth();
  const signedIn = status === "authenticated" && Boolean(user);

  const leagues = useQuery<MyLeaguesDto, PredictionsError>({
    queryKey: ["predictions", "leagues", user?.id ?? ""],
    queryFn: ({ signal }) => predictionsService.myLeagues(signal),
    enabled: signedIn,
    staleTime: 60_000,
  });

  if (!signedIn) {
    return (
      <UiCard padding="md" className="flex flex-col gap-3" testId="predictions-leagues-signed-out">
        <p className={ui.text.body}>{t("predictions.leagues.signed_out")}</p>
        <UiButton
          variant="ink"
          onClick={() => requireAuth(() => {}, { reason: t("predictions.leagues.signed_out") })}
        >
          {t("predictions.guest.cta_button")}
        </UiButton>
      </UiCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2" aria-labelledby="predictions-leagues-title">
        <h2 id="predictions-leagues-title" className={cn(ui.text.label, ui.tone.muted)}>
          {t("predictions.leagues.title")}
        </h2>
        {leagues.isPending ? (
          <UiStatePanel kind="loading" />
        ) : leagues.isError ? (
          <UiErrorState onRetry={() => void leagues.refetch()} />
        ) : leagues.data.items.length === 0 ? (
          <UiEmptyState title={t("predictions.leagues.empty")} />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="predictions-my-leagues">
            {leagues.data.items.map((league) => (
              <li key={league.leagueId}>
                <Link
                  to="/pronostics/ligues/$leagueId"
                  params={{ leagueId: league.leagueId }}
                  className={cn(
                    "flex items-center justify-between gap-3 p-3",
                    ui.surface.card,
                    ui.focus,
                    "transition-transform duration-[var(--duration-tap)] active:translate-y-px",
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className={cn("truncate", ui.text.bodyStrong)} dir="auto">
                      {league.name}
                    </span>
                    <span className={cn(ui.text.meta, ui.tone.muted)}>
                      {membersLabel(league.members, lang, t)}
                      {" · "}
                      {pointsLabel(league.seasonPoints, lang, t, (n) => formatNumber(n, lang))}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <UiBadge tone={league.via === "fantasy" ? "action" : "outline"}>
                      {league.via === "fantasy"
                        ? t("predictions.leagues.via_fantasy")
                        : t("predictions.leagues.via_predictions")}
                    </UiBadge>
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <JoinLeagueForm />
      <CreateLeagueForm />
    </div>
  );
}
