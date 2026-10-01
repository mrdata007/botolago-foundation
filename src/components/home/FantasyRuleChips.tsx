import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { cn } from "@/lib/utils";
import { SQUAD_RULES } from "@/types/fantasy";

/**
 * What playing Fantasy takes, in four chips under Home's Fantasy card:
 * "15 joueurs · 100 M · Capitaine ×2" and the next deadline's date. The
 * figures are the squad rules the Fantasy screens already use, so a rule
 * changed there changes here. Plain, quiet chips: the card above is the call
 * to action.
 */
export function FantasyRuleChips({ deadline }: { deadline?: string }) {
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const nf = new Intl.NumberFormat(locale);
  const when = deadline
    ? new Intl.DateTimeFormat(locale, {
        timeZone: MATCH_TIME_ZONE,
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(deadline))
    : null;
  const chips = [
    t("home.fantasy_chip_players").replace("{n}", nf.format(SQUAD_RULES.totalSize)),
    t("home.fantasy_chip_budget").replace("{n}", nf.format(SQUAD_RULES.budget)),
    t("home.fantasy_chip_captain"),
    ...(when ? [t("home.fantasy_chip_deadline").replace("{when}", when)] : []),
  ];
  return (
    <ul className="mt-2.5 flex flex-wrap gap-1.5" data-testid="fantasy-rule-chips">
      {chips.map((chip) => (
        <li
          key={chip}
          className={cn(
            "px-2.5 py-1",
            ui.radius.full,
            ui.surface.sunken,
            ui.text.meta,
            "[font-weight:var(--ui-weight-strong)]",
          )}
        >
          {chip}
        </li>
      ))}
    </ul>
  );
}
