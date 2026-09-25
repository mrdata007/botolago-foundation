import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { LeaderboardScope, OpenLeaderboardDto } from "@/backend/predictions/contracts";
import type { PredictionsError } from "@/backend/predictions/errors";
import { pointsLabel } from "@/components/matches/standings-copy";
import {
  ui,
  UiButton,
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
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { predictionsService } from "@/services/predictions";
import { formatNumber, matchesLeftLabel, roundsPlayedLabel } from "./predictions-copy";

/**
 * The journée and season rankings: 50 rows a page from the saved ranks,
 * shared ranks marked "=", the reader's own line highlighted, and — for a
 * visitor with picks on the phone — their local points, unranked (plan §7).
 */
export function PredictionsLeaderboard({
  roundNumber,
  uid,
  guestPoints,
}: {
  roundNumber: number;
  uid: string | null;
  /** A visitor's points on this phone for the journée, when they have some. */
  guestPoints: number | null;
}) {
  const { t, lang } = useI18n();
  const [scope, setScope] = useState<LeaderboardScope>("round");

  const board = useInfiniteQuery<OpenLeaderboardDto | null, PredictionsError>({
    queryKey: ["predictions", "board", scope, scope === "round" ? roundNumber : "season", uid],
    initialPageParam: null as OpenLeaderboardDto["nextCursor"],
    queryFn: async ({ pageParam, signal }) => {
      const page = await predictionsService.leaderboard(
        {
          scope,
          roundNumber: scope === "round" ? roundNumber : null,
          cursor: pageParam as OpenLeaderboardDto["nextCursor"],
        },
        signal,
      );
      return page.allowed ? page : null;
    },
    getNextPageParam: (last) => last?.nextCursor ?? undefined,
    staleTime: 5 * 60_000,
  });

  const first = board.data?.pages[0] ?? null;
  const rows = board.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="predictions-board-title">
      <h2 id="predictions-board-title" className="sr-only">
        {t("predictions.tab.board")}
      </h2>
      <UiSegmented<LeaderboardScope>
        value={scope}
        onChange={setScope}
        label={t("predictions.board.scope_label")}
        options={[
          { value: "round", label: t("predictions.board.round") },
          { value: "season", label: t("predictions.board.season") },
        ]}
      />

      {scope === "round" && first?.provisional && (first.matchesLeft ?? 0) > 0 ? (
        <p className={cn(ui.text.meta, ui.tone.muted)} data-testid="predictions-board-provisional">
          {matchesLeftLabel(first.matchesLeft ?? 0, lang, t)}
        </p>
      ) : null}

      {!uid && guestPoints !== null ? (
        <UiCard padding="sm" testId="predictions-board-guest">
          <p className={ui.text.bodyStrong}>
            {t("predictions.guest.unranked").replace(
              "{points}",
              pointsLabel(guestPoints, lang, t, (n) => formatNumber(n, lang)),
            )}
          </p>
        </UiCard>
      ) : null}

      {board.isPending ? (
        <UiStatePanel kind="loading" />
      ) : board.isError ? (
        <UiErrorState onRetry={() => void board.refetch()} />
      ) : rows.length === 0 ? (
        <UiEmptyState title={t("predictions.board.empty")} />
      ) : (
        <UiCard padding="none" className="overflow-hidden">
          <UiTable caption={t("predictions.tab.board")}>
            <UiTHead>
              <tr>
                <UiTH className="w-14">{t("predictions.board.col_rank")}</UiTH>
                <UiTH>{t("predictions.board.col_player")}</UiTH>
                <UiTH numeric>{t("predictions.board.col_points")}</UiTH>
                <UiTH numeric>{t("predictions.board.col_exact")}</UiTH>
                {scope === "season" ? (
                  <UiTH numeric>{t("predictions.board.col_rounds")}</UiTH>
                ) : null}
              </tr>
            </UiTHead>
            <UiTBody>
              {rows.map((row) => (
                <UiTR key={row.id} highlighted={row.isMe}>
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
                  {scope === "season" ? (
                    <UiTD numeric>
                      <span className="sr-only">
                        {roundsPlayedLabel(row.roundsPlayed ?? 0, lang, t)}
                      </span>
                      <span aria-hidden>{formatNumber(row.roundsPlayed ?? 0, lang)}</span>
                    </UiTD>
                  ) : null}
                </UiTR>
              ))}
            </UiTBody>
          </UiTable>
        </UiCard>
      )}

      {first?.me && !rows.some((row) => row.isMe) && first.me.rank !== null ? (
        <UiCard padding="sm" testId="predictions-board-me">
          <p className={ui.text.bodyStrong}>
            {t("predictions.board.you")} · <bdi>{formatNumber(first.me.rank, lang)}</bdi>
            {" · "}
            {pointsLabel(first.me.points, lang, t, (n) => formatNumber(n, lang))}
          </p>
        </UiCard>
      ) : null}

      {board.hasNextPage ? (
        <UiButton
          variant="soft"
          onClick={() => void board.fetchNextPage()}
          disabled={board.isFetchingNextPage}
        >
          {t("predictions.board.load_more")}
        </UiButton>
      ) : null}
    </section>
  );
}
