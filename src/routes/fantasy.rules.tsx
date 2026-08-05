import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Coins, LayoutGrid, Medal, Star, Timer, Trophy, Users } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/States";
import { FantasyGuideGrid } from "@/components/fantasy/FantasyGuideGrid";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { fantasyService } from "@/services/fantasy-runtime";

export const Route = createFileRoute("/fantasy/rules")({
  component: RulesPage,
});

function RulesPage() {
  const { t } = useI18n();
  const rulesQ = useQuery({
    queryKey: ["fantasy-rules"],
    queryFn: () => fantasyService.getRules(),
  });

  if (rulesQ.isLoading) return <LoadingState />;
  if (rulesQ.isError || !rulesQ.data) {
    return <ErrorState onRetry={() => void rulesQ.refetch()} />;
  }
  const rules = rulesQ.data;

  const sections: {
    icon: React.ComponentType<{ className?: string }>;
    titleKey: TranslationKey;
    descKey: TranslationKey;
  }[] = [
    {
      icon: Users,
      titleKey: "fantasy.rules.squad",
      descKey: "fantasy.rules.squad_desc",
    },
    {
      icon: Coins,
      titleKey: "fantasy.rules.budget",
      descKey: "fantasy.rules.budget_desc",
    },
    {
      icon: LayoutGrid,
      titleKey: "fantasy.rules.formation",
      descKey: "fantasy.rules.formation_desc",
    },
    {
      icon: Star,
      titleKey: "fantasy.rules.captaincy",
      descKey: "fantasy.rules.captaincy_desc",
    },
    {
      icon: ArrowRightLeft,
      titleKey: "fantasy.rules.transfers_r",
      descKey: "fantasy.rules.transfers_desc",
    },
    {
      icon: Timer,
      titleKey: "fantasy.rules.deadlines",
      descKey: "fantasy.rules.deadlines_desc",
    },
    {
      icon: Trophy,
      titleKey: "fantasy.rules.scoring",
      descKey: "fantasy.rules.scoring_desc",
    },
    {
      icon: Medal,
      titleKey: "fantasy.rules.tiebreak",
      descKey: "fantasy.rules.tiebreak_desc",
    },
  ];

  return (
    <div>
      <h1 className="text-xl font-black text-foreground">
        <span className="text-brand">{t("fantasy.rules.title")}</span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("fantasy.rules.intro")}</p>

      <FantasyGuideGrid />

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RuleValue label={t("fantasy.rules.squad")} value={String(rules.squadSize)} />
        <RuleValue label={t("fantasy.rules.budget")} value={String(rules.budget)} />
        <RuleValue
          label={t("fantasy.rules.transfers_r")}
          value={`${rules.initialFreeTransfers} / -${rules.transferHitCost}`}
        />
        <RuleValue
          label={t("fantasy.rules.deadlines")}
          value={`${rules.deadline.minutesBeforeFirstFixture} min`}
        />
      </dl>

      <div className="mt-4 grid gap-2">
        {sections.map((section) => (
          <section
            key={section.titleKey}
            className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] p-4"
          >
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bg-brand-gradient)] text-white">
                <section.icon className="h-4 w-4" aria-hidden />
              </div>
              <h2 className="text-sm font-black text-foreground">{t(section.titleKey)}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(section.descKey)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}

function RuleValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/60 p-3 text-center ring-1 ring-black/5">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-black tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
