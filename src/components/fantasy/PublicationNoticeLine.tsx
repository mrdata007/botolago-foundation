import { fill } from "@/components/manager-card/interpolate";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { PublicationNotice } from "@/services/fantasy-publication-notice";

import { formatPublicationMoment } from "./publication-notice";

/**
 * "Points de la Journée 6 : samedi 31 oct. à 14h": a journée's points are
 * published all at once (migration 20261030100000), and until then the screen
 * says when. Morocco's time, French and Arabic; the hour is isolated left to
 * right inside Arabic text.
 */
export function PublicationNoticeLine({
  notice,
  className,
  now = Date.now(),
}: {
  notice: PublicationNotice;
  className?: string;
  /** The clock, for tests. */
  now?: number;
}) {
  const { t, lang } = useI18n();
  // Once the moment has passed and the points are not out yet, a time in the
  // past would be wrong: say that publication is under way.
  if (Date.parse(notice.publishAt) <= now)
    return (
      <p role="status" className={cn(ui.text.meta, ui.tone.muted, className)}>
        {fill(t("fantasy.points.publish_now"), { n: notice.gameweek })}
      </p>
    );
  const { day, time } = formatPublicationMoment(lang, notice.publishAt);
  return (
    <p role="status" className={cn(ui.text.meta, ui.tone.muted, className)}>
      {fill(t("fantasy.points.publish_at"), { n: notice.gameweek, day, time })}
    </p>
  );
}
