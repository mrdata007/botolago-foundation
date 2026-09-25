import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { LeaderboardScope, LeagueStandingsDto } from "@/backend/predictions/contracts";
import { mapPredictionsError, type PredictionsError } from "@/backend/predictions/errors";
import {
  ui,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiSegmented,
  UiStatePanel,
  UiTable,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { formatNumber } from "../predictions-copy";
import { leagueStandingsQuery } from "./league-queries";
import { leagueScope } from "./league-scope";
import { leagueErrorMessage, notPlayedLabel } from "./leagues-copy";

/**
 * A league's Pronostics ranking: its Fantasy managers and its Pronostics-only
 * members, each person once, ranked when read (plan §7). Shared by the
 * Pronostics league page and the Fantasy league page's "Pronostics" tab.
 */
export function LeaguePredictionsStandings({
  leagueId,
  roundNumber,
}: {
  leagueId: string;
  /** The journée for the "Journée" scope; null hides that scope. */
  roundNumber: number | null;
}) {
  const { t, lang } = useI18n();
  const { status, user } = useAuth();
  const uid = status === "authenticated" ? (user?.id ?? "") : "";
  const [picked, setPicked] = useState<LeaderboardScope | null>(null);
  const scope = leagueScope(roundNumber, picked);
  const effectiveRound = scope === "round" ? roundNumber : null;

  const standings = useQuery<LeagueStandingsDto, PredictionsError>({
    ...leagueStandingsQuery(leagueId, effectiveRound, uid),
    enabled: uid !== "",
  });

  return (
    <section className="flex flex-col gap-3" data-testid="predictions-league-standings">
      {roundNumber !== null ? (
        <UiSegmented<LeaderboardScope>
          value={scope}
          onChange={setPicked}
          label={t("predictions.board.scope_label")}
          options={[
            {
              value: "round",
              label: t("predictions.round.name").replace("{n}", String(roundNumber)),
            },
            { value: "season", label: t("predictions.board.season") },
          ]}
        />
      ) : null}

      {standings.isPending ? (
        <UiStatePanel kind="loading" />
      ) : standings.isError ? (
        <UiErrorState
          title={leagueErrorMessage(mapPredictionsError(standings.error).code, t)}
          onRetry={() => void standings.refetch()}
        />
      ) : standings.data.items.length === 0 ? (
        <UiEmptyState title={t("predictions.board.empty")} />
      ) : (
        <UiCard padding="none" className="overflow-hidden">
          <UiTable caption={standings.data.league.name}>
            <UiTHead>
              <tr>
                <UiTH className="w-14">{t("predictions.board.col_rank")}</UiTH>
                <UiTH>{t("predictions.board.col_player")}</UiTH>
                <UiTH numeric>{t("predictions.board.col_points")}</UiTH>
                <UiTH numeric>{t("predictions.board.col_exact")}</UiTH>
              </tr>
            </UiTHead>
            <UiTBody>
              {standings.data.items.map((row, index) => (
                <UiTR key={`${row.rank}-${index}`} highlighted={row.isMe}>
                  <UiTD strong>
                    <bdi>{formatNumber(row.rank, lang)}</bdi>
                    {row.tied ? (
                      <span
                        aria-label={t("predictions.board.tied")}
                        title={t("predictions.board.tied")}
                      >
                        =
                      </span>
                    ) : null}
                  </UiTD>
                  <UiTD className="max-w-0 truncate">
                    <span dir="auto">{row.isMe ? t("predictions.board.you") : row.name}</span>
                  </UiTD>
                  <UiTD numeric strong>
                    {formatNumber(row.points, lang)}
                  </UiTD>
                  <UiTD numeric>{formatNumber(row.exact, lang)}</UiTD>
                </UiTR>
              ))}
            </UiTBody>
          </UiTable>
        </UiCard>
      )}

      {standings.data && standings.data.notPlayed > 0 ? (
        <p className={cn(ui.text.meta, ui.tone.muted)}>
          {notPlayedLabel(standings.data.notPlayed, lang, t)}
        </p>
      ) : null}
    </section>
  );
}
