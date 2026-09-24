import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { LeagueStandingsDto, MyLeaguesDto } from "@/backend/predictions/contracts";
import { mapPredictionsError, type PredictionsError } from "@/backend/predictions/errors";
import { useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";
import {
  ui,
  UiButton,
  UiCard,
  UiErrorState,
  UiHeader,
  UiModal,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { predictionsService } from "@/services/predictions";
import { roundQueryOptions } from "../use-predictions-round";
import { InviteLinkShare } from "./InviteLinkShare";
import { leagueStandingsQuery } from "./league-queries";
import { LeaguePredictionsStandings } from "./LeaguePredictionsStandings";
import { leagueErrorMessage } from "./leagues-copy";

/**
 * `/pronostics/ligues/$leagueId`: the league's Pronostics ranking, the owner's
 * invite tools (a new code, shown once, with the share buttons), and "Quitter"
 * for a Pronostics member. A Fantasy member leaves in Fantasy, and is pointed
 * to the league's Fantasy ranking instead. `noindex`: set by the route.
 */
export function LeaguePage({ leagueId }: { leagueId: string }) {
  const { t, lang } = useI18n();
  const { status, user, requireAuth } = useAuth();
  const signedIn = status === "authenticated" && Boolean(user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newCode, setNewCode] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const round = useQuery(roundQueryOptions(null, lang));
  const currentRound = round.data?.allowed ? (round.data.round?.number ?? null) : null;

  const header = useQuery<LeagueStandingsDto, PredictionsError>({
    ...leagueStandingsQuery(leagueId, null),
    enabled: signedIn,
  });
  const mine = useQuery<MyLeaguesDto, PredictionsError>({
    queryKey: ["predictions", "leagues", user?.id ?? ""],
    queryFn: ({ signal }) => predictionsService.myLeagues(signal),
    enabled: signedIn,
    staleTime: 60_000,
  });
  const membership = mine.data?.items.find((item) => item.leagueId === leagueId);

  const reset = useMutation({
    mutationFn: () => predictionsService.resetInviteCode(leagueId),
    onSuccess: (result) => {
      setNewCode(result.inviteCode);
      void queryClient.invalidateQueries({ queryKey: ["predictions", "league", leagueId] });
    },
    onError: (failure) => toast.error(leagueErrorMessage(mapPredictionsError(failure).code, t)),
  });
  const leave = useMutation({
    mutationFn: () => predictionsService.leaveLeague(leagueId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["predictions", "leagues"] });
      toast.success(
        t("predictions.leagues.left").replace("{league}", header.data?.league.name ?? ""),
      );
      void navigate({ to: "/pronostics", search: { tab: "ligues" } });
    },
    onError: (failure) => toast.error(leagueErrorMessage(mapPredictionsError(failure).code, t)),
  });

  const name = header.data?.league.name;
  const shell = (content: ReactNode) => (
    <AppShell
      topBar={
        <UiHeader
          sticky
          kicker={t("predictions.tab.leagues")}
          title={name ?? t("predictions.title")}
          onBack={() => void navigate({ to: "/pronostics", search: { tab: "ligues" } })}
        />
      }
    >
      <div className="flex flex-col gap-4 pt-2">{content}</div>
    </AppShell>
  );

  if (!signedIn) {
    return shell(
      <UiCard padding="md" className="flex flex-col gap-3">
        <p className={ui.text.body}>{t("predictions.leagues.signed_out")}</p>
        <UiButton
          variant="ink"
          onClick={() => {
            track("pronostics_signup_click");
            requireAuth(() => {}, { reason: t("predictions.leagues.signed_out") });
          }}
        >
          {t("predictions.guest.cta_button")}
        </UiButton>
      </UiCard>,
    );
  }
  if (header.isPending) return shell(<UiStatePanel kind="loading" />);
  if (header.isError) {
    return shell(
      <UiErrorState
        title={leagueErrorMessage(mapPredictionsError(header.error).code, t)}
        onRetry={() => void header.refetch()}
      />,
    );
  }

  const isOwner = header.data.league.isOwner;
  return shell(
    <>
      <LeaguePredictionsStandings leagueId={leagueId} roundNumber={currentRound} />

      {isOwner ? (
        <UiCard padding="md" className="flex flex-col gap-3" testId="predictions-league-owner">
          {header.data.league.inviteCodeHint ? (
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {t("predictions.leagues.code_hint").replace(
                "{hint}",
                header.data.league.inviteCodeHint,
              )}
            </p>
          ) : null}
          <UiButton variant="soft" onClick={() => setConfirmReset(true)} disabled={reset.isPending}>
            {t("predictions.leagues.reset_code")}
          </UiButton>
        </UiCard>
      ) : null}
      {newCode ? (
        <InviteLinkShare league={header.data.league.name} code={newCode} showCode />
      ) : null}

      {membership?.via === "fantasy" ? (
        <Link
          to="/fantasy/leagues/$leagueId"
          params={{ leagueId }}
          className={cn(ui.text.bodyStrong, "underline underline-offset-4", ui.focus)}
        >
          {t("predictions.leagues.see_fantasy")}
        </Link>
      ) : membership && !isOwner ? (
        <UiButton variant="ghost" onClick={() => setConfirmLeave(true)} disabled={leave.isPending}>
          {t("predictions.leagues.leave")}
        </UiButton>
      ) : null}

      <UiModal
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("predictions.leagues.reset_code")}
        description={t("predictions.leagues.reset_warning")}
        footer={
          <>
            <UiButton
              variant="ink"
              onClick={() => {
                setConfirmReset(false);
                reset.mutate();
              }}
            >
              {t("common.confirm")}
            </UiButton>
            <UiButton variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
              {t("common.cancel")}
            </UiButton>
          </>
        }
      />
      <UiModal
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={t("predictions.leagues.leave")}
        description={t("predictions.leagues.leave_confirm").replace(
          "{league}",
          header.data.league.name,
        )}
        footer={
          <>
            <UiButton
              variant="destructive"
              onClick={() => {
                setConfirmLeave(false);
                leave.mutate();
              }}
            >
              {t("predictions.leagues.leave")}
            </UiButton>
            <UiButton variant="ghost" size="sm" onClick={() => setConfirmLeave(false)}>
              {t("common.cancel")}
            </UiButton>
          </>
        }
      />
    </>,
  );
}
