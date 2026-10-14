import { useI18n } from "@/i18n/provider";
import type { LiveStageLabels } from "@/lib/live-minute";

/** The stage words (French or Arabic) `liveMinuteLabel` falls back to without a minute. */
export function useLiveStageLabels(): LiveStageLabels {
  const { t } = useI18n();
  return {
    first_half: t("matches.stage.first_half"),
    half_time: t("matches.status.ht"),
    second_half: t("matches.stage.second_half"),
    extra_time: t("matches.status.extra_time"),
    penalties: t("matches.status.penalties"),
  };
}
