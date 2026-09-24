import { ui, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/** The 3/1/0 rule, the lock and the tie-break, in a bottom sheet. */
export function ScoringRulesSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <UiSheet open={open} onOpenChange={onOpenChange} title={t("predictions.rules.title")}>
      <ul className={cn("flex flex-col gap-3 p-4", ui.text.body)}>
        <li className={ui.text.bodyStrong}>{t("predictions.rules.exact")}</li>
        <li className={ui.text.bodyStrong}>{t("predictions.rules.outcome")}</li>
        <li className={ui.text.bodyStrong}>{t("predictions.rules.miss")}</li>
        <li>{t("predictions.rules.lock")}</li>
        <li>{t("predictions.rules.postponed")}</li>
        <li>{t("predictions.rules.ties")}</li>
      </ul>
    </UiSheet>
  );
}
