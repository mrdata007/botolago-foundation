import { UiSegmented } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";

export type SquadViewMode = "squad" | "list";

interface Props {
  value: SquadViewMode;
  onChange: (v: SquadViewMode) => void;
  className?: string;
}

/**
 * Switch between the pitch ("Équipe") and the grouped list ("Liste").
 *
 * It was a bespoke glass pill at `text-xs` with 30px targets; it is now the
 * kit's segmented control, which is the 44px floor, carries the one focus
 * ring and themes correctly.
 */
export function SquadListToggle({ value, onChange, className }: Props) {
  const { t } = useI18n();
  return (
    <UiSegmented<SquadViewMode>
      value={value}
      onChange={onChange}
      label={t("fantasy.view.toggle_label")}
      className={className}
      options={[
        { value: "squad", label: t("fantasy.view.squad") },
        { value: "list", label: t("fantasy.view.list") },
      ]}
    />
  );
}
