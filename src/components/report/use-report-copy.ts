import { useI18n } from "@/i18n/provider";
import type { ReportCopy } from "@/lib/report-content";

/** The report message's words, in the reader's language. One literal key each. */
export function useReportCopy(): ReportCopy {
  const { t } = useI18n();
  return {
    subject: t("report.mail.subject"),
    kindLabel: t("report.mail.kind"),
    nameLabel: t("report.mail.name"),
    idLabel: t("report.mail.id"),
    pageLabel: t("report.mail.page"),
    reasonPrompt: t("report.mail.reason"),
    kinds: {
      team: t("report.kind.team"),
      league: t("report.kind.league"),
      user: t("report.kind.user"),
    },
  };
}
