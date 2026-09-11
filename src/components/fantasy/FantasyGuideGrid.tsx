import { useId } from "react";
import { Activity, ArrowRightLeft, LayoutGrid, Users, type LucideIcon } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { fantasyOnboardingSteps, type FantasyOnboardingStepId } from "./fantasy-onboarding-model";

const guideIcons = {
  squad: Users,
  lineup: LayoutGrid,
  live: Activity,
  manage: ArrowRightLeft,
} satisfies Record<FantasyOnboardingStepId, LucideIcon>;

export function FantasyGuideStepIcon({
  stepId,
  className = "h-5 w-5",
}: {
  stepId: FantasyOnboardingStepId;
  className?: string;
}) {
  const Icon = guideIcons[stepId];

  return <Icon className={className} aria-hidden />;
}

export function FantasyGuideGrid({ className }: { className?: string }) {
  const { t, dir } = useI18n();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} dir={dir} className={cn("mt-5 text-start", className)}>
      <div className="max-w-2xl">
        <h2 id={headingId} className="text-lg font-black text-foreground">
          {t("fantasy.guide.title")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t("fantasy.guide.subtitle")}
        </p>
      </div>

      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {fantasyOnboardingSteps.map((step, index) => (
          <li
            key={step.id}
            className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] p-4"
          >
            <div className="flex items-start gap-3 xl:block">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--bg-brand-gradient)] text-white">
                <FantasyGuideStepIcon stepId={step.id} className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1 xl:mt-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--brand-primary)]">
                  {t("fantasy.onboarding.step")} {index + 1}
                </div>
                <h3 className="mt-1 text-sm font-black text-foreground">{t(step.titleKey)}</h3>
                <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">
                  {t(step.bodyKey)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
