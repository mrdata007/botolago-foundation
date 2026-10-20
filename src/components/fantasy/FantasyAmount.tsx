import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const FORMATS = {
  fr: new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  ar: new Intl.NumberFormat("ar-MA", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};

/** A Fantasy price or budget, in the game's existing million-based unit. */
export function FantasyAmount({ value, className }: { value: number; className?: string }) {
  const { t, lang } = useI18n();
  const amount = FORMATS[lang].format(value);

  return (
    <span className={cn("inline-flex items-baseline gap-1 whitespace-nowrap", className)}>
      <span aria-hidden="true">
        <bdi dir="ltr">{amount}</bdi>{" "}
        <span className="text-[0.75em]">{t("fantasy.players.price_unit")}</span>
      </span>
      <span className="sr-only">{t("fantasy.amount.millions").replace("{amount}", amount)}</span>
    </span>
  );
}
