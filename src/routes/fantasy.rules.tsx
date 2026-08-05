import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Users, Coins, LayoutGrid, Star, ArrowRightLeft, Timer, Trophy } from "lucide-react";
import { fantasyService } from "@/services/fantasy-runtime";
import { ErrorState, LoadingState } from "@/components/common/States";

export const Route = createFileRoute("/fantasy/rules")({
  component: RulesPage,
});

function RulesPage() {
  const { t, lang } = useI18n();
  const rulesQ = useQuery({
    queryKey: ["fantasy-rules"],
    queryFn: () => fantasyService.getRules(),
  });

  if (rulesQ.isLoading) return <LoadingState />;
  if (rulesQ.isError || !rulesQ.data) {
    return <ErrorState onRetry={() => void rulesQ.refetch()} />;
  }
  const rules = rulesQ.data;
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    maximumFractionDigits: 1,
  });
  const positionLabel = (position: (typeof rules.positions)[number]["code"]) =>
    t(`player.pos.${position}` as TranslationKey);
  const positions = rules.positions
    .map((position) => `${positionLabel(position.code)} ${position.squadQuota}`)
    .join(" · ");
  const formationRanges = rules.positions
    .map(
      (position) =>
        `${positionLabel(position.code)} ${position.startingMinimum}–${position.startingMaximum}`,
    )
    .join(" · ");
  const scoring = rules.positions
    .map(
      (position) =>
        `${positionLabel(position.code)} ${position.goalPoints}/${position.cleanSheetPoints}`,
    )
    .join(" · ");

  const sections: {
    icon: React.ComponentType<{ className?: string }>;
    titleKey: TranslationKey;
    description: string;
  }[] = [
    {
      icon: Users,
      titleKey: "fantasy.rules.squad",
      description: t("fantasy.rules.squad_desc_dynamic")
        .replace("{total}", String(rules.squadSize))
        .replace("{positions}", positions),
    },
    {
      icon: Coins,
      titleKey: "fantasy.rules.budget",
      description: t("fantasy.rules.budget_desc_dynamic")
        .replace("{budget}", nf.format(rules.budget))
        .replace("{clubLimit}", String(rules.maxPlayersPerClub)),
    },
    {
      icon: LayoutGrid,
      titleKey: "fantasy.rules.formation",
      description: t("fantasy.rules.formation_desc_dynamic")
        .replace("{starters}", "11")
        .replace("{ranges}", formationRanges),
    },
    {
      icon: Star,
      titleKey: "fantasy.rules.captaincy",
      description: t("fantasy.rules.captaincy_desc_dynamic").replace(
        "{multiplier}",
        nf.format(rules.captainMultiplier),
      ),
    },
    {
      icon: ArrowRightLeft,
      titleKey: "fantasy.rules.transfers_r",
      description: t("fantasy.rules.transfers_desc_dynamic")
        .replace("{free}", String(rules.initialFreeTransfers))
        .replace("{rollover}", String(rules.maxFreeTransferRollover))
        .replace("{cost}", String(rules.transferHitCost)),
    },
    {
      icon: Timer,
      titleKey: "fantasy.rules.deadlines",
      description: t("fantasy.rules.deadlines_desc_dynamic").replace(
        "{minutes}",
        String(rules.deadline.minutesBeforeFirstFixture),
      ),
    },
    {
      icon: Trophy,
      titleKey: "fantasy.rules.scoring",
      description: t("fantasy.rules.scoring_desc_dynamic").replace("{scoring}", scoring),
    },
  ];

  return (
    <div>
      <h1 className="text-xl font-black text-foreground">
        <span className="text-brand">{t("fantasy.rules.title")}</span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("fantasy.rules.intro")}</p>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        {sections.map((s) => (
          <section
            key={s.titleKey}
            className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] p-4"
          >
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bg-brand-gradient)] text-white">
                <s.icon className="h-4 w-4" aria-hidden />
              </div>
              <h2 className="text-sm font-black text-foreground">{t(s.titleKey)}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
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
