import { useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { InviteCode } from "@/components/fantasy-lists/InviteCode";
import { ui, UiAlert, UiButton, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

/**
 * The owner's invite-code card on a private league's page.
 *
 * The database keeps only a digest of the code, so the full code is shown
 * once, when the league is created, and this card cannot show it again. What
 * it can do is say which code is live — its last four characters — and replace
 * it. Replacing takes two presses, because it cuts off everyone still holding
 * the old code; managers who already joined stay in the league.
 *
 * Each step replaces the button that had focus, so each step takes focus: the
 * confirm step on its safe choice, Cancel back on the button it replaced, and
 * the new code on its copy control. Without that, focus falls to <body> and a
 * keyboard or screen-reader user is not told that anything changed.
 */
export function LeagueInviteCard({ leagueId, hint }: { leagueId: string; hint?: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { key } = useFantasyDataSource();
  const promptId = useId();
  const triggerId = useId();
  const refocusTrigger = useRef(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (armed || !refocusTrigger.current) return;
    refocusTrigger.current = false;
    document.getElementById(triggerId)?.focus();
  }, [armed, triggerId]);

  const replace = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fantasyService.resetLeagueInviteCode(leagueId);
      setCode(result.code);
      setArmed(false);
      toast.success(t("fantasy.leagues.new_code_done"));
      // The league row carries the hint, which just changed.
      await qc.invalidateQueries({ queryKey: key("league", leagueId) });
    } catch {
      toast.error(t("state.error"));
    } finally {
      setBusy(false);
    }
  };

  if (code) {
    return (
      <UiCard className="mt-6">
        <InviteCode code={code} className="mt-0" focusCopy />
      </UiCard>
    );
  }

  return (
    <UiCard className="mt-6">
      <h2 className={cn(ui.text.bodyStrong, ui.tone.default)}>{t("fpl.invite_code")}</h2>
      {hint ? (
        <p className={cn("mt-1", ui.text.secondary, ui.tone.default)}>
          {t("fantasy.leagues.code_ends_with")}{" "}
          <code
            dir="ltr"
            className={cn("font-mono [font-weight:var(--ui-weight-heavy)]", ui.text.tabular)}
          >
            {hint}
          </code>
        </p>
      ) : null}
      <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
        {t("fantasy.leagues.code_once_help")}
      </p>

      {armed ? (
        <div role="group" aria-labelledby={promptId} className="mt-3">
          <UiAlert tone="caution" live={false}>
            <span id={promptId}>{t("fantasy.leagues.new_code_confirm")}</span>
          </UiAlert>
          <div className="mt-3 flex flex-wrap gap-2">
            <UiButton
              size="sm"
              variant="ink"
              className="flex-auto"
              disabled={busy}
              onClick={() => void replace()}
            >
              {busy ? t("fpl.saving") : t("fantasy.leagues.new_code_confirm_action")}
            </UiButton>
            <UiButton
              size="sm"
              variant="soft"
              className="flex-auto"
              disabled={busy}
              autoFocus
              onClick={() => {
                refocusTrigger.current = true;
                setArmed(false);
              }}
            >
              {t("common.cancel")}
            </UiButton>
          </div>
        </div>
      ) : (
        <UiButton
          id={triggerId}
          size="sm"
          variant="soft"
          className="mt-3"
          onClick={() => setArmed(true)}
        >
          <KeyRound className="h-4 w-4" aria-hidden />
          {t("fantasy.leagues.new_code")}
        </UiButton>
      )}
    </UiCard>
  );
}
