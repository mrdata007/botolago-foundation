import { RefreshCw } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { ui, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { LiveFreshness } from "@/lib/match-freshness";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";

/** `{time}` in a translated sentence, the time isolated in a `<bdi>`. */
function withTime(sentence: string, time: string): ReactNode {
  const parts = sentence.split("{time}");
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 ? <bdi className={ui.text.tabular}>{time}</bdi> : null}
    </Fragment>
  ));
}

/**
 * Under the score header of a live match: when the page last heard from the
 * server (docs/screens/2026-10-14-live-match-freshness/BRIEF.md).
 *
 * - fresh: one quiet line, "Mis à jour à 21:05". Not a live region: it changes
 *   every 30 seconds, and the score is the page's one live region.
 * - stale: "Score non actualisé depuis 21:05" and an "Actualiser" button.
 * - expired: the same, saying the score may not be final; the header has
 *   already swapped its live pill for a neutral one.
 *
 * The stale and expired notices are a polite status, announced once when they
 * appear. The time is in Casablanca time, as every time on the page.
 */
export function LiveFreshnessNote({
  freshness,
  updatedAt,
  refreshing,
  onRefresh,
}: {
  freshness: LiveFreshness;
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t, lang } = useI18n();
  if (freshness === "not_live" || !(updatedAt > 0)) return null;
  const time = moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(updatedAt));

  if (freshness === "fresh") {
    return (
      <p
        data-testid="live-freshness"
        data-freshness="fresh"
        className={cn("mt-2 px-1 text-center", ui.text.meta, ui.tone.muted)}
      >
        {withTime(t("matches.detail.updated_at"), time)}
      </p>
    );
  }

  return (
    <div
      role="status"
      data-testid="live-freshness"
      data-freshness={freshness}
      className={cn(
        "mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2",
        ui.radius.control,
      )}
      style={{
        backgroundColor: "color-mix(in oklab, var(--ui-caution) 14%, var(--ui-surface))",
        color: "var(--ui-on-surface)",
      }}
    >
      <p className={cn("min-w-0 flex-1", ui.text.secondary)}>
        {withTime(
          freshness === "expired"
            ? t("matches.detail.stale_expired")
            : t("matches.detail.stale_since"),
          time,
        )}
      </p>
      <UiButton
        variant="outline"
        size="sm"
        onClick={onRefresh}
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
