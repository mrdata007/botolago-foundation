import rulesArt from "@/assets/illustrations/rules-hero.webp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CalendarDays,
  Coins,
  LayoutGrid,
  Medal,
  Star,
  Timer,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Fragment, useMemo, type ComponentType, type ReactNode } from "react";

import { chipDescription } from "@/components/fpl/chip-copy";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import {
  ui,
  UiCard,
  UiErrorState,
  UiHeader,
  UiSkeleton,
  UiStatePanel,
  UiTable,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
import {
  buildChipList,
  buildScoringTable,
  templateParts,
  type ChipWindow,
  type RulesChip,
  type RulesChipType,
  type RulesTablePosition,
  type ScoringTable as ScoringTableModel,
  type ScoringTableRow,
} from "@/lib/fantasy-rules-table";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";

export const Route = createFileRoute("/fantasy/rules")({
  head: () => fantasyHead("rules"),
  component: RulesFramed,
});

/**
 * Fantasy "Rules", in the Option A language.
 *
 * It no longer goes through `LegacyFantasyPage` (a frame plus the old
 * gradient `FplHeader`) or the non-kit `common/States`: the header is
 * `UiHeader` with the Fantasy kicker, the loading and error states are the
 * kit's, the four key numbers are on the tabular stat ramp — the transfer
 * cost isolated left-to-right so its minus stays in front of the number in
 * Arabic — and each rule is a card with a round gradient icon disc.
 *
 * BG-0155 (5): the transfers line, the chips card and the scoring table are
 * read from `api.fantasy_rules` (`positions`, `scoring`, `chips`) through
 * `src/lib/fantasy-rules-table.ts`, so the page states the scale the server
 * scores with — a goalkeeper's goal is 10, not the 6 the old copy said. When
 * the server sends no scale, one plain line says so; no figure is guessed.
 */
function RulesFramed() {
  const { t } = useI18n();
  return (
    <FantasyFrame bottomNav>
      <UiHeader kicker={t("nav.fantasy")} title={t("fpl.rules")} backTo="/fantasy" />
      <div className={cn("pb-6 pt-4", ui.space.gutter, ui.surface.page)}>
        <RulesPage />
      </div>
    </FantasyFrame>
  );
}

function RulesPage() {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const rulesQ = useQuery({
    queryKey: ["fantasy-rules"],
    queryFn: () => fantasyService.getRules(),
  });
  const rules = rulesQ.data;
  // Read from the server's own lists; nothing here computes a point.
  const scoringTable = useMemo(() => (rules ? buildScoringTable(rules) : null), [rules]);
  const chips = useMemo(() => (rules ? buildChipList(rules.chips) : []), [rules]);

  const sections: {
    icon: ComponentType<{ className?: string }>;
    titleKey: TranslationKey;
    descKey?: TranslationKey;
    /** Read from the ruleset: shown once it has arrived, never guessed before. */
    body?: ReactNode;
  }[] = [
    { icon: Users, titleKey: "fantasy.rules.squad", descKey: "fantasy.rules.squad_desc" },
    { icon: Coins, titleKey: "fantasy.rules.budget", descKey: "fantasy.rules.budget_desc" },
    {
      icon: LayoutGrid,
      titleKey: "fantasy.rules.formation",
      descKey: "fantasy.rules.formation_desc",
    },
    { icon: Star, titleKey: "fantasy.rules.captaincy", descKey: "fantasy.rules.captaincy_desc" },
    {
      icon: ArrowRightLeft,
      titleKey: "fantasy.rules.transfers_r",
      // The ruleset's own numbers: free transfers, how many can be carried,
      // and the cost of each extra one.
      body: rules ? (
        <RuleText>
          <Filled
            template={t("fantasy.rules.transfers_rule")}
            values={{
              free: nf.format(rules.initialFreeTransfers),
              max: nf.format(rules.maxFreeTransferRollover),
              hit: nf.format(rules.transferHitCost),
            }}
          />
        </RuleText>
      ) : (
        <RulesPending failed={rulesQ.isError} />
      ),
    },
    ...(chips.length > 0
      ? [
          {
            icon: Zap,
            titleKey: "fantasy.rules.chips" as const,
            body: <ChipsList chips={chips} nf={nf} />,
          },
        ]
      : []),
    { icon: Timer, titleKey: "fantasy.rules.deadlines", descKey: "fantasy.rules.deadlines_desc" },
    {
      icon: Trophy,
      titleKey: "fantasy.rules.scoring",
      descKey: "fantasy.rules.scoring_desc",
      body: rules ? (
        scoringTable ? (
          <ScoringTable table={scoringTable} nf={nf} />
        ) : (
          // Never a partial or invented scale: one plain line instead.
          <RuleText>{t("fantasy.rules.scoring_unavailable")}</RuleText>
        )
      ) : rulesQ.isError ? (
        <RuleText>{t("fantasy.rules.scoring_unavailable")}</RuleText>
      ) : (
        <RulesPending failed={false} />
      ),
    },
    { icon: Medal, titleKey: "fantasy.rules.tiebreak", descKey: "fantasy.rules.tiebreak_desc" },
  ];

  return (
    <div>
      <img
        src={rulesArt}
        alt=""
        aria-hidden
        decoding="async"
        className="mx-auto mb-4 h-auto max-h-40 w-full object-contain"
      />
      {/* An h2: the header above already renders the page's h1. */}
      <h2 className={cn(ui.display.section, ui.tone.default)}>{t("fantasy.rules.title")}</h2>
      <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("fantasy.rules.intro")}</p>

      {rulesQ.isLoading ? (
        <UiStatePanel kind="loading" />
      ) : rulesQ.isError || !rulesQ.data ? (
        <UiErrorState onRetry={() => void rulesQ.refetch()} />
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RuleValue label={t("fantasy.rules.squad")} value={nf.format(rulesQ.data.squadSize)} />
          <RuleValue label={t("fantasy.rules.budget")} value={nf.format(rulesQ.data.budget)} />
          <RuleValue
            label={t("fantasy.rules.transfers_r")}
            value={
              // "1 / -4" is a figure pair, not prose: isolated left-to-right so
              // the minus stays in front of its number in Arabic.
              <bdi dir="ltr">
                {nf.format(rulesQ.data.initialFreeTransfers)} / -
                {nf.format(rulesQ.data.transferHitCost)}
              </bdi>
            }
          />
          <RuleValue
            label={t("fantasy.rules.deadlines")}
            value={
              <>
                <bdi>{nf.format(rulesQ.data.deadline.minutesBeforeFirstFixture)}</bdi>{" "}
                <span className={cn(ui.text.meta, ui.tone.muted)}>{t("home.minutes")}</span>
              </>
            }
          />
        </dl>
      )}

      <div className="mt-4 grid gap-2">
        {sections.map((s) => (
          <RuleCard key={s.titleKey} icon={s.icon} title={t(s.titleKey)}>
            {s.descKey ? <RuleText>{t(s.descKey)}</RuleText> : null}
            {s.body}
          </RuleCard>
        ))}
      </div>

      {/* The points screen links here (#scoring-policy). Provisional points
          and corrections apply to every ruleset; the fixture policy and the
          reviewed-estimates line only where the ruleset declares them. */}
      <UiCard as="section" id="scoring-policy" className="mt-4 scroll-mt-20">
        <h3 className={cn(ui.display.teamSm, ui.tone.default)}>
          {t("fantasy.rules.policy_title")}
        </h3>
        <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
          {t("fantasy.rules.provisional_desc")}
        </p>
        {rulesQ.data?.adaptiveScoring && (
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
            {t("fantasy.scoring.policy")}
          </p>
        )}
        {rulesQ.data?.adaptiveScoring?.estimatesFinalForRankings && (
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
            {t("fantasy.scoring.estimatesPolicy")}
          </p>
        )}
      </UiCard>
    </div>
  );
}

/** A rule: a round gradient icon disc, its title, then its body. */
function RuleCard({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children?: ReactNode;
}) {
  return (
    <UiCard as="section">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center",
            ui.radius.full,
            "text-[color:var(--ui-ink-deep)]",
          )}
          style={{ backgroundImage: "var(--ui-grad-action)" }}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
        <h3 className={cn(ui.display.teamSm, ui.tone.default)}>{title}</h3>
      </div>
      {children}
    </UiCard>
  );
}

function RuleText({ children }: { children: ReactNode }) {
  return <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{children}</p>;
}

/**
 * A dictionary line with its `{slots}` filled, each figure in its own
 * `<bdi>` so it keeps its place inside an Arabic sentence.
 */
function Filled({ template, values }: { template: string; values: Record<string, string> }) {
  return (
    <>
      {templateParts(template).map((part, index) =>
        part.kind === "text" ? (
          <Fragment key={index}>{part.text}</Fragment>
        ) : (
          <bdi key={index}>{values[part.name] ?? ""}</bdi>
        ),
      )}
    </>
  );
}

/**
 * The scoring scale: one row per event, one column per position, every
 * figure as the server sent it. A real table, so a screen reader names the
 * event and the position of each figure; the page's direction mirrors it.
 */
function ScoringTable({ table, nf }: { table: ScoringTableModel; nf: Intl.NumberFormat }) {
  const { t } = useI18n();
  return (
    // Full-bleed inside the card: the head band and the hairlines run to the
    // card's edges, and the figures get the width they need at 390px.
    <>
      <UiTable
        caption={t("fantasy.rules.scoring")}
        className={cn("-mx-4 mt-3 w-auto", table.fullAppearanceMinutes === null && "-mb-4")}
      >
        <UiTHead>
          <tr>
            <UiTH className="ps-4">{t("fantasy.rules.table_event")}</UiTH>
            {table.columns.map((code, index) => (
              <UiTH
                key={code}
                numeric
                // From 640px the figures keep a column each and the events take
                // the rest, instead of spreading across the whole card.
                className={cn("text-center sm:w-16", index === table.columns.length - 1 && "pe-4")}
              >
                <span aria-hidden>{positionShort(code, t)}</span>
                <span className="sr-only">{positionFull(code, t)}</span>
              </UiTH>
            ))}
          </tr>
        </UiTHead>
        <UiTBody>
          {table.rows.map((row) => (
            <UiTR key={`${row.kind}:${row.n ?? ""}`} className="last:border-b-0">
              <th
                scope="row"
                className={cn(
                  "py-2 pe-2 ps-4 text-start align-middle",
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-strong)]",
                  ui.tone.default,
                )}
              >
                {rowLabel(row, t, nf)}
              </th>
              {row.cells.map((cell, index) => (
                <UiTD
                  key={table.columns[index]}
                  numeric
                  className={cn("text-center", index === row.cells.length - 1 && "pe-4")}
                >
                  <PointsFigure value={cell} nf={nf} />
                </UiTD>
              ))}
            </UiTR>
          ))}
        </UiTBody>
      </UiTable>
      {/* The scorer counts these two only from the full-appearance minutes
        (src/backend/fantasy/scoring.ts); without it the table would promise
        a defender subbed off at 45' his clean sheet. */}
      {table.fullAppearanceMinutes !== null &&
      table.rows.some((row) => row.kind === "clean_sheet" || row.kind === "goals_conceded") ? (
        <RuleText>
          <Filled
            template={t("fantasy.rules.full_minutes_note")}
            values={{ n: nf.format(table.fullAppearanceMinutes) }}
          />
        </RuleText>
      ) : null}
    </>
  );
}

/**
 * One figure. A penalty carries its minus sign (and the negative tone on
 * top of it, never instead of it), isolated left-to-right so the sign stays
 * in front of the number in Arabic; 0 is a real 0; an event that does not
 * apply to the position is a dash with a spoken name.
 */
function PointsFigure({ value, nf }: { value: number | null; nf: Intl.NumberFormat }) {
  const { t } = useI18n();
  if (value === null) {
    return (
      <>
        <span aria-hidden className={ui.tone.muted}>
          —
        </span>
        <span className="sr-only">{t("fantasy.rules.table_na")}</span>
      </>
    );
  }
  if (value < 0) {
    return (
      <bdi dir="ltr" className={ui.tone.negative}>
        {`−${nf.format(-value)}`}
      </bdi>
    );
  }
  return <bdi dir="ltr">{nf.format(value)}</bdi>;
}

/** The chips, under their recorded names: what each does and when it can be played. */
function ChipsList({ chips, nf }: { chips: readonly RulesChip[]; nf: Intl.NumberFormat }) {
  const { t } = useI18n();
  return (
    <ul className="mt-1">
      {chips.map(({ chip, windows }, index) => (
        <li key={chip} className={cn("pt-3", index > 0 && cn("mt-3", ui.rule.blockStart))}>
          <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{chipName(chip, t)}</p>
          <p className={cn(ui.text.secondary, ui.tone.muted)}>{chipDescription(chip, t)}</p>
          {/* Each allocation is one use, so each gets its own line. The Joker
              says only how many: the server plays it in the season's own
              halves (`wildcard_split_gameweek` in api.activate_fantasy_chip),
              which api.fantasy_rules does not report, so the ruleset's rounds
              could be wrong here. */}
          {chip === "wildcard" ? (
            <ChipUse>
              {windows.length === 1
                ? t("fantasy.rules.chip_uses_once")
                : windows.length === 2
                  ? t("fantasy.rules.chip_uses_twice")
                  : null}
            </ChipUse>
          ) : (
            windows.map((window) => (
              <ChipUse key={`${window.from}:${window.to ?? ""}`}>
                {chipWindow(window, t, nf)}
              </ChipUse>
            ))
          )}
        </li>
      ))}
    </ul>
  );
}

/** One use of a chip, on its own line. */
function ChipUse({ children }: { children: ReactNode }) {
  if (children === null) return null;
  return (
    <p className={cn("mt-1 flex items-center gap-1.5", ui.text.meta, ui.tone.default)}>
      <CalendarDays className={cn("h-4 w-4 shrink-0", ui.tone.ink)} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/**
 * A card's ruleset figures while they are on their way (a placeholder line),
 * or when they could not be read (one plain line, never a guess).
 */
function RulesPending({ failed }: { failed: boolean }) {
  const { t } = useI18n();
  return failed ? (
    <RuleText>{t("fantasy.rules.value_unavailable")}</RuleText>
  ) : (
    <UiSkeleton className="mt-2 h-4 w-4/5" />
  );
}

type Translate = (key: TranslationKey) => string;

// Literal branches, never `fantasy.rules.row.${kind}`: a key assembled at
// runtime is invisible to the i18n gate and to the TranslationKey type alike.
function rowLabel(row: ScoringTableRow, t: Translate, nf: Intl.NumberFormat): ReactNode {
  const withN = (template: string) =>
    row.n === null ? template : <Filled template={template} values={{ n: nf.format(row.n) }} />;
  switch (row.kind) {
    case "appearance_short":
      // "Under {n} minutes" needs the full-appearance threshold; without one
      // the row is simply an appearance.
      return row.n === null
        ? t("fantasy.rules.row.appearance")
        : withN(t("fantasy.rules.row.appearance_short"));
    case "appearance_full":
      return withN(t("fantasy.rules.row.appearance_full"));
    case "goal":
      return t("fantasy.rules.row.goal");
    case "official_assist":
      return t("fantasy.rules.row.official_assist");
    case "clean_sheet":
      return t("fantasy.rules.row.clean_sheet");
    case "saves":
      return withN(t("fantasy.rules.row.saves"));
    case "penalty_save":
      return t("fantasy.rules.row.penalty_save");
    case "goals_conceded":
      return withN(t("fantasy.rules.row.goals_conceded"));
    case "penalty_miss":
      return t("fantasy.rules.row.penalty_miss");
    case "yellow_card":
      return t("fantasy.rules.row.yellow_card");
    case "direct_red_card":
      return t("fantasy.rules.row.direct_red_card");
    case "second_yellow_dismissal":
      return t("fantasy.rules.row.second_yellow_dismissal");
    case "own_goal":
      return t("fantasy.rules.row.own_goal");
  }
}

/** The app's own short position labels (GB / DEF / MIL / ATT, حارس / مدافع / وسط / مهاجم). */
function positionShort(code: RulesTablePosition, t: Translate): string {
  return code === "GK"
    ? t("player.pos.GK")
    : code === "DEF"
      ? t("player.pos.DEF")
      : code === "MID"
        ? t("player.pos.MID")
        : t("player.pos.FWD");
}

/** What a screen reader says for a column: the full group name. */
function positionFull(code: RulesTablePosition, t: Translate): string {
  return code === "GK"
    ? t("fpl.group.GK")
    : code === "DEF"
      ? t("fpl.group.DEF")
      : code === "MID"
        ? t("fpl.group.MID")
        : t("fpl.group.FWD");
}

function chipName(chip: RulesChipType, t: Translate): string {
  return chip === "bench_boost"
    ? t("fantasy.chip.bench_boost")
    : chip === "free_hit"
      ? t("fantasy.chip.free_hit")
      : chip === "triple_captain"
        ? t("fantasy.chip.triple_captain")
        : t("fantasy.chip.wildcard");
}

/** The rounds one allocation covers, as the ruleset records them. */
function chipWindow(window: ChipWindow, t: Translate, nf: Intl.NumberFormat): ReactNode {
  if (window.to === null) {
    return window.from === 1 ? (
      t("fantasy.rules.chip_window_season")
    ) : (
      <Filled
        template={t("fantasy.rules.chip_window_from")}
        values={{ from: nf.format(window.from) }}
      />
    );
  }
  if (window.to === window.from) {
    return (
      <Filled
        template={t("fantasy.rules.chip_window_single")}
        values={{ n: nf.format(window.from) }}
      />
    );
  }
  return (
    <Filled
      template={t("fantasy.rules.chip_window_range")}
      values={{ from: nf.format(window.from), to: nf.format(window.to) }}
    />
  );
}

function RuleValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={cn("px-3 py-3 text-center", ui.radius.card, ui.surface.card)}>
      <dt className={cn(ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd className={cn("mt-1", ui.stat.lg, ui.tone.default)}>{value}</dd>
    </div>
  );
}
