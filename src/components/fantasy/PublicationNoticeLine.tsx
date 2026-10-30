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
}: {
  notice: PublicationNotice;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const { day, time } = formatPublicationMoment(lang, notice.publishAt);
  return (
    <p role="status" className={cn(ui.text.meta, ui.tone.muted, className)}>
      {fill(t("fantasy.points.publish_at"), { n: notice.gameweek, day, time })}
    </p>
  );
}
