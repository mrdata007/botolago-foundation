import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { predictionsService } from "@/services/predictions";
import { formatLockMoment, formatNumber } from "./predictions-copy";
import { noteServerTime, predictionsKeys, roundQueryOptions } from "./use-predictions-round";

/**
 * The Home card (plan §9, entry point 1), right after the upcoming matches.
 * A player sees the journée, their progress and the next lock; a visitor, an
 * invitation to try. It hides itself while the database has the game off.
 */
export function PredictionsHomeCard() {
  const { t, lang } = useI18n();
  const { status, user } = useAuth();
  const uid = status === "authenticated" ? (user?.id ?? null) : null;
  const round = useQuery(roundQueryOptions(null, lang));
  const data = round.data?.allowed ? round.data : null;
  const journee = data?.round ?? null;

  const mine = useQuery({
    queryKey: predictionsKeys.mine(uid ?? "", journee?.number ?? 0),
    queryFn: async ({ signal }) => {
      const result = await predictionsService.getMyPredictions(
        { roundNumber: journee?.number ?? null, fixtureId: null },
        signal,
      );
      noteServerTime(result.serverTime);
      return result;
    },
    enabled: Boolean(uid) && journee !== null,
    staleTime: 60_000,
  });

  if (!data || !journee) return null;
  const total = data.fixtures.filter((fixture) => !fixture.void).length;
  const done = mine.data?.items.length ?? 0;

  return (
    <Link
      to="/pronostics"
      className={cn(
        "flex items-center gap-3 p-4",
        ui.surface.card,
        ui.focus,
        "transition-transform duration-[var(--duration-tap)] active:translate-y-px",
      )}
      data-testid="home-predictions-card"
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center",
          ui.radius.full,
          ui.surface.inkPlain,
        )}
      >
        <Target className="h-5 w-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={ui.text.bodyStrong}>
          {t("predictions.title")} ·{" "}
          {t("predictions.round.name").replace("{n}", String(journee.number))}
        </span>
        <span className={cn("truncate", ui.text.meta, ui.tone.muted)}>
          {uid
            ? t("predictions.progress")
                .replace("{done}", formatNumber(done, lang))
                .replace("{total}", formatNumber(total, lang))
            : t("predictions.home.guest_line")}
          {uid && journee.nextLockAt
            ? ` · ${t("predictions.next_lock").replace("{when}", formatLockMoment(journee.nextLockAt, lang))}`
            : null}
        </span>
      </span>
      <span className={cn("shrink-0", ui.text.bodyStrong, ui.tone.ink)}>
        {t("predictions.home.cta")}
      </span>
    </Link>
  );
}
