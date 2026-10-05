import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { mapPredictionsError } from "@/backend/predictions/errors";
import { useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";
import { ui, UiButton, UiCard, UiHeader, UiLinkButton, UiStatePanel } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { predictionsService } from "@/services/predictions";
import { clearPendingInvite, takeInviteFromLocation, type PendingInvite } from "./invite-link";
import { leagueErrorMessage } from "./leagues-copy";

/**
 * `/pronostics/ligues/rejoindre#code=…&game=…`: the page an invite link opens.
 *
 * The invite is read from after "#", taken out of the address bar at once, and
 * kept on this device while a visitor signs up (invite-link.ts). Nothing joins
 * on its own — not on opening the link, not on coming back signed in: the
 * recipient taps "Rejoindre" (or, for a Fantasy invite, joins on the Fantasy
 * form, which needs a team and holds the code ready).
 *
 * The league's name is not shown before joining: nothing reveals a league to
 * someone holding only a link preview, and the code is the only key.
 */
export function InviteLandingPage() {
  const { t } = useI18n();
  const { status, user, requireAuth } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState<PendingInvite | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const signedIn = status === "authenticated" && Boolean(user);

  useEffect(() => {
    setInvite(takeInviteFromLocation());
  }, []);

  const code = invite?.code ?? null;
  const fantasy = invite?.game === "fantasy";

  const join = useMutation({
    mutationFn: (value: string) => predictionsService.joinLeague(value),
    onSuccess: (result) => {
      clearPendingInvite();
      void queryClient.invalidateQueries({ queryKey: ["predictions", "leagues"] });
      toast.success(
        result.joined
          ? t("predictions.leagues.joined").replace("{league}", result.name)
          : t("predictions.leagues.already_member"),
      );
      void navigate({
        to: "/pronostics/ligues/$leagueId",
        params: { leagueId: result.leagueId },
        replace: true,
      });
    },
    onError: (failure) => {
      const mapped = mapPredictionsError(failure);
      if (mapped.code === "invite_code_invalid") clearPendingInvite();
      // This page has no field it could mark invalid, so the sentence stands
      // beside the only way to try again. The invite itself is kept for when
      // a code owed (the one-time code) is in.
      setError(leagueErrorMessage(mapped.code, t));
    },
  });
  // One join per tap: a second tap while the first is on its way does nothing.
  const joinPredictions = () => {
    if (!code || join.isPending) return;
    setError(null);
    join.mutate(code);
  };

  const header = (
    <UiHeader
      sticky
      kicker={t("predictions.title")}
      title={t("predictions.tab.leagues")}
      backTo="/pronostics"
    />
  );

  if (invite === undefined || status === "loading") {
    return (
      <AppShell topBar={header}>
        <UiStatePanel kind="loading" />
      </AppShell>
    );
  }

  return (
    <AppShell topBar={header}>
      <UiCard padding="md" className="mt-2 flex flex-col gap-3" testId="predictions-invite">
        <h2 className={ui.text.bodyStrong}>
          {fantasy
            ? t("predictions.leagues.invite_generic_fantasy")
            : t("predictions.leagues.invite_generic")}
        </h2>
        {!code ? (
          <p className={cn(ui.text.meta, ui.tone.muted)}>
            {t("predictions.leagues.invite_missing")}
          </p>
        ) : (
          <p className={cn(ui.text.meta, ui.tone.muted)}>
            {t("predictions.leagues.invite_explain")}
          </p>
        )}
        {error ? (
          <p role="alert" className={ui.text.meta}>
            {error}
          </p>
        ) : null}
        {code && !signedIn ? (
          <>
            <p className={ui.text.meta}>{t("predictions.leagues.invite_signup")}</p>
            <UiButton
              variant="ink"
              onClick={() => {
                track("pronostics_signup_click");
                requireAuth(() => {}, { reason: t("predictions.leagues.invite_signup") });
              }}
            >
              {t("predictions.guest.cta_button")}
            </UiButton>
          </>
        ) : code && fantasy ? (
          <>
            <UiLinkButton to="/fantasy/leagues/join" variant="ink">
              {t("predictions.leagues.invite_join_fantasy")}
            </UiLinkButton>
            <button
              type="button"
              onClick={joinPredictions}
              disabled={join.isPending}
              className={cn(
                "self-start",
                ui.text.meta,
                ui.tone.muted,
                "underline underline-offset-4",
                ui.focus,
              )}
            >
              {t("predictions.leagues.invite_predictions_hint")}
            </button>
          </>
        ) : code ? (
          <>
            <UiButton
              variant="ink"
              onClick={joinPredictions}
              disabled={join.isPending}
              aria-busy={join.isPending}
            >
              {t("predictions.leagues.invite_join_predictions")}
            </UiButton>
            <Link
              to="/fantasy/leagues/join"
              className={cn(ui.text.meta, ui.tone.muted, "underline underline-offset-4", ui.focus)}
            >
              {t("predictions.leagues.invite_fantasy_hint")}
            </Link>
          </>
        ) : (
          <Link
            to="/pronostics"
            search={{ tab: "ligues" }}
            className={cn(ui.text.bodyStrong, "underline underline-offset-4", ui.focus)}
          >
            {t("predictions.leagues.join")}
          </Link>
        )}
      </UiCard>
    </AppShell>
  );
}
