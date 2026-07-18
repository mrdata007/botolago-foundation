import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Users, Coins, LayoutGrid, Star, ArrowRightLeft, Timer, Trophy, Medal } from "lucide-react";

export const Route = createFileRoute("/fantasy/rules")({
  component: RulesPage,
});

function RulesPage() {
  const { t } = useI18n();

  const sections: { icon: React.ComponentType<{ className?: string }>; titleKey: TranslationKey; descKey: TranslationKey }[] = [
    { icon: Users, titleKey: "fantasy.rules.squad", descKey: "fantasy.rules.squad_desc" },
    { icon: Coins, titleKey: "fantasy.rules.budget", descKey: "fantasy.rules.budget_desc" },
    { icon: LayoutGrid, titleKey: "fantasy.rules.formation", descKey: "fantasy.rules.formation_desc" },
    { icon: Star, titleKey: "fantasy.rules.captaincy", descKey: "fantasy.rules.captaincy_desc" },
    { icon: ArrowRightLeft, titleKey: "fantasy.rules.transfers_r", descKey: "fantasy.rules.transfers_desc" },
    { icon: Timer, titleKey: "fantasy.rules.deadlines", descKey: "fantasy.rules.deadlines_desc" },
    { icon: Trophy, titleKey: "fantasy.rules.scoring", descKey: "fantasy.rules.scoring_desc" },
    { icon: Medal, titleKey: "fantasy.rules.tiebreak", descKey: "fantasy.rules.tiebreak_desc" },
  ];

  return (
    <div>
      <h1 className="text-xl font-black text-foreground"><span className="text-brand">{t("fantasy.rules.title")}</span></h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("fantasy.rules.intro")}</p>

      <div className="mt-4 grid gap-2">
        {sections.map((s) => (
          <section key={s.titleKey} className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bg-brand-gradient)] text-white">
                <s.icon className="h-4 w-4" aria-hidden />
              </div>
              <h2 className="text-sm font-black text-foreground">{t(s.titleKey)}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(s.descKey)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
