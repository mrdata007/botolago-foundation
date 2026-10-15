import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { leagueFreshness } from "@/lib/league-freshness";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";

/**
 * The line under a league's title saying how old its standings are
 * (`leagueFreshness`): when they were calculated, else when this page last
 * read them (worded as such), else nothing. It never reads the clock, so it
 * cannot move unless the data does.
 */
export function LeagueUpdatedLine({
  standings,
  retrievedAt,
}: {
  standings: readonly { readonly calculatedAt?: string }[];
  /** React Query's `dataUpdatedAt` for the standings: 0 until a read succeeded. */
  retrievedAt: number;
}) {
  const { t, lang } = useI18n();
  const freshness = leagueFreshness(standings, retrievedAt);
  if (!freshness) return null;
  // BG-0100: pinned to the competition calendar, never the viewer's. A
  // formatter without `timeZone` disagrees with every other time on the page.
  const when = moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(freshness.at));
  return (
    <p className={cn("text-center", ui.text.meta, ui.tone.muted)}>
      {freshness.kind === "calculated" ? t("fpl.last_updated") : t("fpl.last_retrieved")}:{" "}
      <strong className={cn(ui.tone.default, "[font-weight:var(--ui-weight-heavy)]")}>
        {when}
      </strong>
    </p>
  );
}
