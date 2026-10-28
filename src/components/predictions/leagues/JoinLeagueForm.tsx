import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { showStepUpNotice } from "@/auth/step-up-notice";
import { mapPredictionsError } from "@/backend/predictions/errors";
import { ui, UiButton, UiCard, UiInput } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
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
    onError: (failure) => {
      // Refused until the one-time code is in: the auth layer says so, once
      // (one toast under its id). Nothing is wrong with the code typed, so the
      // field is not marked invalid with that sentence; other refusals are.
      const refusal = mapPredictionsError(failure).code;
      if (refusal === "mfa_required") showStepUpNotice(t);
      else setError(leagueErrorMessage(refusal, t));
    },
  });

  return (
    <UiCard padding="md" className={cn("flex flex-col gap-3", LEAGUE_FORM_WASH)}>
      <h2 className={cn("flex items-center gap-2.5", ui.text.bodyStrong)}>
        <span
          aria-hidden
          className={cn(
            "inline-grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--ui-ink-deep)]",
            ui.shadow.card,
          )}
          style={{ backgroundImage: "var(--ui-grad-action)" }}
        >
          <KeyRound className="h-4 w-4" strokeWidth={2.5} />
        </span>
        {t("predictions.leagues.join")}
      </h2>
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
        <UiButton type="submit" disabled={join.isPending || code.trim() === ""}>
          {t("predictions.leagues.join_button")}
        </UiButton>
      </form>
    </UiCard>
  );
}

/**
 * A sky wash from the top of the box, gone by 70% so the field and its label
 * sit on the plain surface: 24% in light, 14% in dark (where sky over the
 * dark card would lift the background toward the muted label). `to bottom`,
 * so the same in Arabic.
 */
const LEAGUE_FORM_WASH =
  "[--wash:24%] dark:[--wash:14%] bg-[image:linear-gradient(to_bottom,color-mix(in_oklab,var(--ui-accent-sky)_var(--wash),transparent)_0%,transparent_70%)]";
