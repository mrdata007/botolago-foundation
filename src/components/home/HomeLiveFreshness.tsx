import { RefreshCw } from "lucide-react";

import { useLiveFreshness } from "@/components/matches/use-live-freshness";
import { ui, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/domain";

/**
 * Under Home's live card: how old the score is, from real timestamps only
 * (the read's time and the fixture's last change, the match page's own rules
 * in `liveFreshness`).
 *
 * - fresh: "Mis à jour il y a 1 min" ("à l'instant" under a minute);
 * - stale or expired: "Score non actualisé depuis 21:05." and a refresh
 *   button, the match page's wording, so a score that stopped moving is said
 *   rather than shown as live.
 *
 * Nothing shows without a read time. Until the browser's clock has read the
 * age (the server render) the line is left out, so the two renders agree.
 */
export function HomeLiveFreshness({
  match,
  updatedAt,
  refetch,
  refreshing,
}: {
  match: Match;
  /** When the last read of the home matches landed (React Query's `dataUpdatedAt`). */
  updatedAt: number;
  refetch: () => unknown;
  refreshing: boolean;
}) {
  const { t, lang } = useI18n();
  const { freshness, shownAt, now, mounted } = useLiveFreshness({ match, updatedAt, refetch });
  if (!mounted || freshness === "not_live" || !(shownAt > 0)) return null;

  if (freshness === "fresh") {
    const minutes = Math.max(0, Math.floor((now - shownAt) / 60_000));
    const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR");
    const [before = "", after = ""] = t("home.live_updated_ago").split("{n}");
    return (
      <p
        data-testid="home-live-freshness"
        data-freshness="fresh"
        className={cn("mt-2 px-1 text-center", ui.text.meta, ui.tone.muted)}
      >
        {minutes < 1 ? (
          t("home.live_updated_now")
        ) : (
          <>
            {before}
            <bdi className={ui.text.tabular}>{nf.format(minutes)}</bdi>
            {after}
          </>
        )}
      </p>
    );
  }

  const time = moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(shownAt));
  const [before = "", after = ""] = t("matches.detail.stale_since").split("{time}");
  return (
    <div
      role="status"
      data-testid="home-live-freshness"
      data-freshness={freshness}
      className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1"
    >
      <p className={cn("min-w-0 flex-1", ui.text.meta, ui.tone.muted)}>
        {before}
        <bdi className={ui.text.tabular}>{time}</bdi>
        {after}
      </p>
      <UiButton
        variant="outline"
        size="sm"
        onClick={() => void refetch()}
        disabled={refreshing}
        aria-busy={refreshing || undefined}
        className="shrink-0 gap-1.5"
      >
        <RefreshCw
          aria-hidden
          className={cn("h-4 w-4", refreshing && "motion-safe:animate-spin")}
        />
        {t("matches.detail.refresh")}
      </UiButton>
    </div>
  );
}
