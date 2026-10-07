import rulesArt from "@/assets/illustrations/rules-hero.webp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Coins,
  LayoutGrid,
  Medal,
  Sparkles,
  Star,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { RulesChipList, RulesScoringTable } from "@/components/fantasy/FantasyRulesTables";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { ui, UiCard, UiErrorState, UiHeader, UiStatePanel } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
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
 * Every figure on the page is the season's ruleset as the server returns it
 * (`api.fantasy_rules`, the same rules the server applies to every team):
 * the key numbers, the captain multipliers, the free transfers and their
 * carry-over, the scoring table (`RulesScoringTable`) and the chips
 * (`RulesChipList`). The scoring used to be one sentence of copy that gave a
 * goalkeeper's goal 6 points instead of 10 and left most of the scale out;
 * `src/lib/fantasy-rules-table.test.ts` now checks the table against
 * `docs/backend/FANTASY_RULES_V1.md` cell by cell. So the rules render with
 * the request: a skeleton while it runs, "Réessayer" if it fails.
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
      ) : rulesQ.isError || !rules ? (
        <UiErrorState onRetry={() => void rulesQ.refetch()} />
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <RuleValue label={t("fantasy.rules.squad")} value={nf.format(rules.squadSize)} />
            <RuleValue label={t("fantasy.rules.budget")} value={nf.format(rules.budget)} />
            <RuleValue
              label={t("fantasy.rules.transfers_r")}
              value={
                // "1 / -4" is a figure pair, not prose: isolated left-to-right so
                // the minus stays in front of its number in Arabic.
                <bdi dir="ltr">
                  {nf.format(rules.initialFreeTransfers)} / -{nf.format(rules.transferHitCost)}
                </bdi>
              }
            />
            <RuleValue
              label={t("fantasy.rules.deadlines")}
              value={
                <>
                  <bdi>{nf.format(rules.deadline.minutesBeforeFirstFixture)}</bdi>{" "}
                  <span className={cn(ui.text.meta, ui.tone.muted)}>{t("home.minutes")}</span>
                </>
              }
            />
          </dl>

          <div className="mt-4 grid gap-2">
            <RuleCard icon={Users} title={t("fantasy.rules.squad")}>
              {t("fantasy.rules.squad_desc")}
            </RuleCard>
            <RuleCard icon={Coins} title={t("fantasy.rules.budget")}>
              {t("fantasy.rules.budget_desc")}
            </RuleCard>
            <RuleCard icon={LayoutGrid} title={t("fantasy.rules.formation")}>
              {t("fantasy.rules.formation_desc")}
            </RuleCard>
            <RuleCard icon={Star} title={t("fantasy.rules.captaincy")}>
              {t("fantasy.rules.captaincy_desc")
                .replace("{c}", nf.format(rules.captainMultiplier))
                .replace("{t}", nf.format(rules.tripleCaptainMultiplier))}
            </RuleCard>
            {/* The table runs to the card's edges, so its five columns get
                the whole width of a phone. */}
            <RuleCard
              icon={Trophy}
              title={t("fantasy.rules.scoring")}
              flush
              extra={<RulesScoringTable rules={rules} />}
            >
              {t("fantasy.rules.scoring_desc")}
            </RuleCard>
            <RuleCard icon={ArrowRightLeft} title={t("fantasy.rules.transfers_r")}>
              {t("fantasy.rules.transfers_desc")
                .replace("{free}", nf.format(rules.initialFreeTransfers))
                .replace("{max}", nf.format(rules.maxFreeTransferRollover))
                .replace("{hit}", nf.format(rules.transferHitCost))}
            </RuleCard>
            {rules.chips.length > 0 ? (
              <RuleCard
                icon={Sparkles}
                title={t("fantasy.rules.chips")}
                extra={<RulesChipList rules={rules} />}
              />
            ) : null}
            <RuleCard icon={Timer} title={t("fantasy.rules.deadlines")}>
              {t("fantasy.rules.deadlines_desc")}
            </RuleCard>
            <RuleCard icon={Medal} title={t("fantasy.rules.tiebreak")}>
              {t("fantasy.rules.tiebreak_desc")}
            </RuleCard>
          </div>
        </>
      )}

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
        {rules?.adaptiveScoring && (
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
            {t("fantasy.scoring.policy")}
          </p>
        )}
        {rules?.adaptiveScoring?.estimatesFinalForRankings && (
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
            {t("fantasy.scoring.estimatesPolicy")}
          </p>
        )}
      </UiCard>
    </div>
  );
}

/**
 * One rule: a round gradient icon disc, the title, its sentence (`children`)
 * and, under it, anything longer (`extra`: the scoring table, the chips).
 * `flush` drops the card's side padding so a table can run edge to edge; the
 * heading and the sentence keep theirs.
 */
function RuleCard({
  icon: Icon,
  title,
  flush = false,
  extra,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  flush?: boolean;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <UiCard as="section" padding={flush ? "none" : "md"} className={flush ? "py-4" : undefined}>
      <div className={cn("flex items-center gap-3", flush && "px-4")}>
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
      {children ? (
        <p className={cn("mt-2", flush && "px-4", ui.text.secondary, ui.tone.muted)}>{children}</p>
      ) : null}
      {extra}
    </UiCard>
  );
}

function RuleValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={cn("px-3 py-3 text-center", ui.radius.card, ui.surface.card)}>
      <dt className={cn(ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd className={cn("mt-1", ui.stat.lg, ui.tone.default)}>{value}</dd>
    </div>
  );
}
