import rulesArt from "@/assets/illustrations/rules-hero.webp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Coins, LayoutGrid, Medal, Star, Timer, Trophy, Users } from "lucide-react";
import type { ComponentType } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { ui, UiCard, UiErrorState, UiHeader, UiStatePanel } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";

export const Route = createFileRoute("/fantasy/rules")({
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
 * Arabic — and each rule is a card with a round gradient icon disc. The copy
 * and the numbers are the same, read from the same ruleset.
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

  if (rulesQ.isLoading) return <UiStatePanel kind="loading" />;
  if (rulesQ.isError || !rulesQ.data) {
    return <UiErrorState onRetry={() => void rulesQ.refetch()} />;
  }
  const rules = rulesQ.data;

  const sections: {
    icon: ComponentType<{ className?: string }>;
    titleKey: TranslationKey;
    descKey: TranslationKey;
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
      descKey: "fantasy.rules.transfers_desc",
    },
    { icon: Timer, titleKey: "fantasy.rules.deadlines", descKey: "fantasy.rules.deadlines_desc" },
    { icon: Trophy, titleKey: "fantasy.rules.scoring", descKey: "fantasy.rules.scoring_desc" },
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
        {sections.map((s) => (
          <UiCard as="section" key={s.titleKey}>
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
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className={cn(ui.display.teamSm, ui.tone.default)}>{t(s.titleKey)}</h3>
            </div>
            <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{t(s.descKey)}</p>
          </UiCard>
        ))}
      </div>
    </div>
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
