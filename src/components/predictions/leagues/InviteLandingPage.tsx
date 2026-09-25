import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { mapPredictionsError } from "@/backend/predictions/errors";
import { useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";
import { ui, UiButton, UiCard, UiHeader, UiStatePanel } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { predictionsService } from "@/services/predictions";
import { clearPendingInvite, takeInviteFromLocation } from "./invite-link";
import { leagueErrorMessage } from "./leagues-copy";

/**
 * `/pronostics/ligues/rejoindre#code=…`: the page an invite link opens.
 *
 * The code is read from after "#", taken out of the address bar at once, and
 * kept for this tab only while a visitor signs up; the sign-in prompt brings
 * them back here and the join happens then. The league's name is not shown
 * before joining: nothing reveals a league to someone holding only a link
 * preview, and the code is the only key.
 */
export function InviteLandingPage() {
  const { t } = useI18n();
  const { status, user, requireAuth } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const signedIn = status === "authenticated" && Boolean(user);
  const autoJoined = useRef(false);

  useEffect(() => {
    setCode(takeInviteFromLocation());
  }, []);

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
      // A code owed keeps its sentence here, unlike in the league forms: this
      // page has no field it could mark invalid, and the sentence stands
      // beside the only way to try again, as /fantasy/create's alert keeps
      // it. The invite itself is kept for when the code is in.
      setError(leagueErrorMessage(mapped.code, t));
    },
  });

  // Back from signing up with a code in hand: join once, without a second tap.
  useEffect(() => {
    if (!signedIn || !code || autoJoined.current) return;
    autoJoined.current = true;
    join.mutate(code);
  }, [signedIn, code, join]);

  const header = (
    <UiHeader
      sticky
      kicker={t("predictions.title")}
      title={t("predictions.tab.leagues")}
      backTo="/pronostics"
    />
  );

  if (code === undefined || status === "loading" || join.isPending) {
    return (
      <AppShell topBar={header}>
        <UiStatePanel kind="loading" />
      </AppShell>
    );
  }

  return (
    <AppShell topBar={header}>
      <UiCard padding="md" className="mt-2 flex flex-col gap-3" testId="predictions-invite">
        <h2 className={ui.text.bodyStrong}>{t("predictions.leagues.invite_generic")}</h2>
        {!code ? (
          <p className={cn(ui.text.meta, ui.tone.muted)}>
            {t("predictions.leagues.invite_missing")}
          </p>
        ) : error ? (
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
        ) : code && error ? (
          <UiButton variant="ink" onClick={() => join.mutate(code)}>
            {t("predictions.leagues.invite_join_predictions")}
          </UiButton>
        ) : null}
        {!code ? (
          <Link
            to="/pronostics"
            search={{ tab: "ligues" }}
            className={cn(ui.text.bodyStrong, "underline underline-offset-4", ui.focus)}
          >
            {t("predictions.leagues.join")}
          </Link>
        ) : (
          <Link
            to="/fantasy/leagues/join"
            className={cn(ui.text.meta, ui.tone.muted, "underline underline-offset-4", ui.focus)}
          >
            {t("predictions.leagues.invite_fantasy_hint")}
          </Link>
        )}
      </UiCard>
    </AppShell>
  );
}
