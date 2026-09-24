import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { FootballSeason } from "@/services/football";

/**
 * The season control beside the Matches title: a soft round pill
 * ("2026/2027 ⌄") over the Radix select. The trigger renders the season label
 * itself; left to Radix it clones the whole selected item — label *and*
 * "current" badge — into the pill, where the badge was clipped at 390px
 * (BG-0111). Shared by both Matches tabs, the calendar and the table.
 */
export function SeasonPicker({
  seasons,
  selected,
  loading,
  onChange,
}: {
  seasons: readonly FootballSeason[];
  selected: FootballSeason | undefined;
  loading: boolean;
  onChange: (seasonId: string) => void;
}) {
  const { t, dir } = useI18n();
  return (
    <Select
      dir={dir}
      value={selected?.id ?? ""}
      onValueChange={onChange}
      disabled={seasons.length === 0}
    >
      <SelectTrigger
        aria-label={t("matches.season.label")}
        className={cn(
          "h-auto min-h-[var(--ui-tap-min)] w-auto gap-1.5 border-0 py-0 pe-3 ps-3.5 shadow-none",
          ui.radius.full,
          ui.surface.sunken,
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          "[&>svg]:opacity-100",
          ui.focus,
        )}
      >
        <SelectValue
          placeholder={loading ? t("matches.season.loading") : t("matches.season.unavailable")}
        >
          {selected ? <span className={ui.text.tabular}>{selected.label}</span> : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={cn(ui.radius.card, ui.rule.all, "bg-[color:var(--ui-surface)]")}>
        {seasons.map((season) => (
          <SelectItem
            key={season.id}
            value={season.id}
            className={cn("min-h-[var(--ui-tap-min)]", ui.radius.control)}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  ui.text.body,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.text.tabular,
                )}
              >
                {season.label}
              </span>
              {season.isCurrent && (
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5",
                    ui.radius.full,
                    ui.text.label,
                    ui.surface.sunken,
                    ui.tone.default,
                  )}
                >
                  {t("matches.season.current")}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
