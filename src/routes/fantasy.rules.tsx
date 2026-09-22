import { createFileRoute } from "@tanstack/react-router";
import { LegacyFantasyPage } from "@/components/fpl/LegacyFantasyPage";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Users, Coins, LayoutGrid, Star, ArrowRightLeft, Timer, Trophy, Medal } from "lucide-react";
import { fantasyService } from "@/services/fantasy-runtime";
import { ErrorState, LoadingState } from "@/components/common/States";
import { ui, UiCard } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fantasy/rules")({
  component: RulesFramed,
});

/**
 * Fantasy "Rules" — inside the Fantasy frame and the Fantasy language.
 *
 * The page used to render glass cards (`glass-surface`/`glass-regular`),
 * 16px radii and the Tailwind type ramp, so a *Fantasy* route read in the
 * old product identity. It now uses the UI kit: opaque surfaces, the 6px
 * control radius, the kit's type scale, and `ltr:`-only letter-spacing.
 */
function RulesFramed() {
  const { t } = useI18n();
  return (
    <LegacyFantasyPage title={t("fpl.rules")}>
      <RulesPage />
    </LegacyFantasyPage>
  );
}

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
      <h1 className={cn(ui.text.title, ui.tone.ink)}>{t("fantasy.rules.title")}</h1>
      <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("fantasy.rules.intro")}</p>

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
          <UiCard as="section" key={s.titleKey}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center",
                  ui.radius.control,
                  "text-[color:var(--ui-ink-deep)]",
                )}
                style={{ backgroundImage: "var(--ui-grad-action)" }}
                aria-hidden
              >
                <s.icon className="h-4 w-4" />
              </span>
              <h2 className={cn(ui.text.bodyStrong, ui.tone.default)}>{t(s.titleKey)}</h2>
            </div>
            <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{t(s.descKey)}</p>
          </UiCard>
        ))}
      </div>
    </div>
  );
}

function RuleValue({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("p-3 text-center", ui.radius.control, ui.surface.sunken)}>
      <dt className={cn(ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd
        className={cn(
          "mt-1",
          ui.text.section,
          ui.text.tabular,
          "[font-weight:var(--ui-weight-hero)]",
          ui.tone.default,
        )}
      >
        {value}
      </dd>
    </div>
  );
}
