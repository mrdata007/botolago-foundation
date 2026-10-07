import type { FantasyRulesDto } from "@/backend/fantasy/contracts";
import { ui, UiTable, UiTBody, UiTH, UiTHead, UiTR } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import {
  chipRules,
  RULE_POSITIONS,
  scoresAnything,
  scoringRows,
  type ChipRule,
  type RulePosition,
  type ScoringRow,
} from "@/lib/fantasy-rules-table";
import { cn } from "@/lib/utils";

/**
 * The scoring table of `/fantasy/rules`: one row per event, one column per
 * position, every figure from the season's ruleset (`fantasy-rules-table.ts`).
 *
 * A real `<table>` on the kit's table pieces — a reader scans one position's
 * column top to bottom ("what does a midfielder get?"), which a card grid or a
 * sentence cannot give. On a phone the heads are the short position labels the
 * squad screens use (GB, DEF, MIL, ATT), with the full word kept for screen
 * readers; from `sm` the full word shows. Losses carry their minus sign AND the
 * negative tone, never the colour alone; each figure is isolated left-to-right
 * so the sign stays in front of its number in Arabic. "–" is a position that
 * scores nothing for the event, which the note under the table says.
 */
export function RulesScoringTable({ rules }: { rules: FantasyRulesDto }) {
  const { t, lang } = useI18n();
  const rows = scoringRows(rules).filter(scoresAnything);
  if (rows.length === 0) return null;
  const signed = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    signDisplay: "exceptZero",
  });
  const short: Record<RulePosition, string> = {
    GK: t("player.pos.GK"),
    DEF: t("player.pos.DEF"),
    MID: t("player.pos.MID"),
    FWD: t("player.pos.FWD"),
  };
  const full: Record<RulePosition, string> = {
    GK: t("fantasy.rules.pos.GK"),
    DEF: t("fantasy.rules.pos.DEF"),
    MID: t("fantasy.rules.pos.MID"),
    FWD: t("fantasy.rules.pos.FWD"),
  };
  const features = rules.features ?? {};

  return (
    <>
      <UiTable caption={t("fantasy.rules.scoring")} className="mt-3" tableClassName="table-fixed">
        <UiTHead>
          <tr>
            <UiTH className="ps-4">{t("fantasy.rules.scoring_event")}</UiTH>
            {RULE_POSITIONS.map((position) => (
              <UiTH
                key={position}
                className="w-12 px-1 text-center sm:w-24"
                // The visible abbreviation is the squad screens' own; the
                // full word is what a screen reader announces as the head.
                abbr={full[position]}
              >
                <span aria-hidden className="sm:hidden">
                  {short[position]}
                </span>
                <span className="sr-only sm:not-sr-only">{full[position]}</span>
              </UiTH>
            ))}
          </tr>
        </UiTHead>
        <UiTBody>
          {rows.map((row) => (
            <UiTR key={row.key}>
              <th
                scope="row"
                className={cn(
                  "py-2 pe-2 ps-4 text-start align-middle",
                  ui.text.secondary,
                  "[font-weight:var(--ui-weight-strong)]",
                  ui.tone.default,
                )}
              >
                {eventLabel(row, t)}
              </th>
              {RULE_POSITIONS.map((position) => {
                const points = row.points[position] ?? 0;
                return (
                  <td
                    key={position}
                    className={cn(
                      "px-1 py-2 text-center align-middle",
                      ui.stat.sm,
                      // The dash keeps the default ink: an en dash is a thin
                      // stroke, and in the muted tone it rasterised at 3.8:1
                      // on white (measured), under the 4.5:1 text floor.
                      points < 0 ? ui.tone.negative : ui.tone.default,
                    )}
                  >
                    {points === 0 ? (
                      t("fantasy.stat.none")
                    ) : (
                      <bdi dir="ltr">{signed.format(points)}</bdi>
                    )}
                  </td>
                );
              })}
            </UiTR>
          ))}
        </UiTBody>
      </UiTable>
      <ul className={cn("mt-3 space-y-1 px-4", ui.text.meta, ui.tone.muted)}>
        <li>{t("fantasy.rules.scoring_none")}</li>
        {features.official_assists_only !== false ? (
          <li>{t("fantasy.rules.scoring_official")}</li>
        ) : null}
        {features.bonus_points_enabled === false && features.player_of_match_enabled === false ? (
          <li>{t("fantasy.rules.scoring_no_bonus")}</li>
        ) : null}
      </ul>
    </>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

/** Literal keys, one per branch: the i18n gate reads them statically. */
function eventLabel(row: ScoringRow, t: Translate): string {
  const n = String(row.labelValue ?? "");
  switch (row.category) {
    case "appearance_short":
      return t("fantasy.rules.event.appearance_short").replace("{n}", n);
    case "appearance_full":
      return t("fantasy.rules.event.appearance_full").replace("{n}", n);
    case "goal":
      return t("fantasy.events.goal");
    case "official_assist":
      return t("fantasy.events.assist");
    case "clean_sheet":
      return t("fantasy.events.clean_sheet");
    case "saves":
      return t("fantasy.rules.event.saves").replace("{n}", n);
    case "penalty_save":
      return t("fantasy.events.penalty_save");
    case "goals_conceded":
      return t("fantasy.rules.event.goals_conceded").replace("{n}", n);
    case "penalty_miss":
      return t("fantasy.events.penalty_miss");
    case "yellow_card":
      return t("fantasy.events.yellow");
    case "direct_red_card":
      return t("fantasy.rules.event.direct_red_card");
    case "second_yellow_dismissal":
      return t("fantasy.rules.event.second_yellow_dismissal");
    case "own_goal":
      return t("fantasy.events.own_goal");
    default:
      // A category a later ruleset adds and this page does not name yet:
      // shown under its code rather than dropped, so the table never hides
      // a rule the server applies.
      return row.category;
  }
}

/**
 * The four chips the ruleset allocates, each with what it does and when it
 * can be played — the two Jokers' windows read from the allocations, so a
 * season split elsewhere than journée 15 says so.
 */
export function RulesChipList({ rules }: { rules: FantasyRulesDto }) {
  const { t } = useI18n();
  const chips = chipRules(rules);
  if (chips.length === 0) return null;
  const final = chips.every((chip) => !chip.cancellable);
  return (
    <>
      <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
        {t("fantasy.rules.chips_desc")}
        {final ? ` ${t("fantasy.rules.chips_final")}` : null}
      </p>
      <ul className="mt-2">
        {chips.map((chip, index) => (
          <li
            key={chip.type}
            className={cn("py-3", index < chips.length - 1 && ui.rule.block)}
            data-chip={chip.type}
          >
            <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{chipName(chip, t)}</p>
            <p className={cn("mt-0.5", ui.text.secondary, ui.tone.muted)}>{chipDesc(chip, t)}</p>
            <ul
              className={cn(
                "mt-1",
                ui.text.meta,
                "[font-weight:var(--ui-weight-strong)]",
                ui.tone.ink,
              )}
            >
              {chip.windows.map((window) => (
                <li key={window.from}>{windowLabel(window, t)}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

function chipName(chip: ChipRule, t: Translate): string {
  switch (chip.type) {
    case "wildcard":
      return t("fantasy.chip.wildcard");
    case "triple_captain":
      return t("fantasy.chip.triple_captain");
    case "free_hit":
      return t("fantasy.chip.free_hit");
    case "bench_boost":
      return t("fantasy.chip.bench_boost");
  }
}

function chipDesc(chip: ChipRule, t: Translate): string {
  switch (chip.type) {
    case "wildcard":
      return t("fantasy.chip.wildcard_desc");
    case "triple_captain":
      return t("fantasy.chip.triple_captain_desc");
    case "free_hit":
      return t("fantasy.chip.free_hit_desc");
    case "bench_boost":
      return t("fantasy.chip.bench_boost_desc");
  }
}

function windowLabel(window: { from: number; to: number | null }, t: Translate): string {
  if (window.to !== null) {
    return t("fantasy.rules.chip_window_range")
      .replace("{from}", String(window.from))
      .replace("{to}", String(window.to));
  }
  if (window.from <= 1) return t("fantasy.rules.chip_window_season");
  return t("fantasy.rules.chip_window_from").replace("{from}", String(window.from));
}
