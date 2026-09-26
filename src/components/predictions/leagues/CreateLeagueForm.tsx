import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { showStepUpNotice } from "@/auth/step-up-notice";
import { LEAGUE_NAME_MAX, LEAGUE_NAME_MIN } from "@/backend/predictions/contracts";
import type { CreateLeagueDto } from "@/backend/predictions/contracts";
import { mapPredictionsError } from "@/backend/predictions/errors";
import { ui, UiButton, UiCard, UiInput } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { predictionsService } from "@/services/predictions";
import { InviteLinkShare } from "./InviteLinkShare";
import { leagueErrorMessage } from "./leagues-copy";

/**
 * Create a league without a Fantasy team (owner decision, 2026-09-24). The
 * code comes back once: it is shown with the share buttons straight away.
 */
export function CreateLeagueForm() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateLeagueDto | null>(null);

  const create = useMutation({
    mutationFn: (value: string) => predictionsService.createLeague(value),
    onSuccess: (result) => {
      setCreated(result);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["predictions", "leagues"] });
    },
    onError: (failure) => {
      // Refused until the one-time code is in: the auth layer says so, once
      // (one toast under its id). Nothing is wrong with the name typed, so the
      // field is not marked invalid with that sentence; other refusals are.
      const refusal = mapPredictionsError(failure).code;
      if (refusal === "mfa_required") showStepUpNotice(t);
      else setError(leagueErrorMessage(refusal, t));
    },
  });

  if (created) {
    return (
      <div className="flex flex-col gap-3" data-testid="predictions-league-created">
        {created.inviteCode ? (
          <InviteLinkShare league={created.name} code={created.inviteCode} showCode />
        ) : null}
        <Link
          to="/pronostics/ligues/$leagueId"
          params={{ leagueId: created.leagueId }}
          className={cn(ui.text.bodyStrong, "underline underline-offset-4", ui.focus)}
        >
          {created.name}
        </Link>
      </div>
    );
  }

  return (
    <UiCard padding="md" className="flex flex-col gap-3">
      <h2 className={ui.text.bodyStrong}>{t("predictions.leagues.create")}</h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          const value = name.trim();
          if (value.length < LEAGUE_NAME_MIN || value.length > LEAGUE_NAME_MAX) {
            setError(t("predictions.leagues.name_invalid"));
            return;
          }
          create.mutate(value);
        }}
      >
        <UiInput
          label={t("predictions.leagues.name_label")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={LEAGUE_NAME_MAX}
          dir="auto"
          error={error ?? undefined}
          reserveError
          data-testid="predictions-create-name"
        />
        <UiButton type="submit" variant="ink" disabled={create.isPending || name.trim() === ""}>
          {t("predictions.leagues.create_button")}
        </UiButton>
      </form>
    </UiCard>
  );
}
