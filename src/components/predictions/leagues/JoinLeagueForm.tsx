import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { mapPredictionsError } from "@/backend/predictions/errors";
import { ui, UiButton, UiCard, UiInput } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { predictionsService } from "@/services/predictions";
import { isInviteCode, normalizeInviteCode } from "./invite-link";
import { leagueErrorMessage } from "./leagues-copy";

/** Join a league with its code: spaces and dashes a reader typed are removed. */
export function JoinLeagueForm() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: (value: string) => predictionsService.joinLeague(normalizeInviteCode(value)),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["predictions", "leagues"] });
      toast.success(
        result.joined
          ? t("predictions.leagues.joined").replace("{league}", result.name)
          : t("predictions.leagues.already_member"),
      );
      void navigate({ to: "/pronostics/ligues/$leagueId", params: { leagueId: result.leagueId } });
    },
    onError: (failure) => setError(leagueErrorMessage(mapPredictionsError(failure).code, t)),
  });

  return (
    <UiCard padding="md" className="flex flex-col gap-3">
      <h2 className={ui.text.bodyStrong}>{t("predictions.leagues.join")}</h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          if (!isInviteCode(code)) {
            setError(t("predictions.leagues.code_invalid"));
            return;
          }
          join.mutate(code);
        }}
      >
        <UiInput
          label={t("predictions.leagues.code_label")}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          error={error ?? undefined}
          reserveError
          data-testid="predictions-join-code"
        />
        <UiButton type="submit" variant="ink" disabled={join.isPending || code.trim() === ""}>
          {t("predictions.leagues.join_button")}
        </UiButton>
      </form>
    </UiCard>
  );
}
