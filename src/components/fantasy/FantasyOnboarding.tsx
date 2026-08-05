import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/provider";
import { FantasyGuideStepIcon } from "./FantasyGuideGrid";
import {
  completeFantasyOnboarding,
  fantasyOnboardingSteps,
  hasCompletedFantasyOnboarding,
  type FantasyOnboardingStorage,
} from "./fantasy-onboarding-model";

function getBrowserStorage(): FantasyOnboardingStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function FantasyOnboarding() {
  const { t, dir, isHydrated } = useI18n();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!isHydrated) return;
    const storage = getBrowserStorage();
    setOpen(storage ? !hasCompletedFantasyOnboarding(storage) : false);
  }, [isHydrated]);

  const totalSteps = fantasyOnboardingSteps.length;
  const currentStep =
    fantasyOnboardingSteps[stepIndex] ?? fantasyOnboardingSteps[0];
  const isLastStep = stepIndex === totalSteps - 1;
  const progressLabel = `${t("fantasy.onboarding.step")} ${stepIndex + 1} ${t(
    "fantasy.onboarding.of",
  )} ${totalSteps}`;

  const finish = () => {
    const storage = getBrowserStorage();
    if (storage) completeFantasyOnboarding(storage);
    setOpen(false);
  };

  const advance = () => {
    if (isLastStep) {
      finish();
      return;
    }
    setStepIndex((current) => Math.min(current + 1, totalSteps - 1));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) finish();
      }}
    >
      <DialogContent
        dir={dir}
        className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto p-5 sm:p-6 [&>button:last-child]:hidden"
      >
        <DialogHeader className="text-start sm:text-start">
          <DialogTitle className="text-xl font-black">
            {t("fantasy.onboarding.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {progressLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xl"
            onClick={finish}
            className="shrink-0 px-2 text-xs text-muted-foreground"
          >
            {t("fantasy.onboarding.skip")}
          </Button>
        </div>

        <div
          role="progressbar"
          aria-label={progressLabel}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={stepIndex + 1}
          aria-valuetext={progressLabel}
          className="flex gap-1"
        >
          {fantasyOnboardingSteps.map((step, index) => (
            <span
              key={step.id}
              aria-hidden
              className={[
                "h-1.5 flex-1 rounded-full transition-colors duration-[var(--duration-quick)]",
                index <= stepIndex
                  ? "bg-[color:var(--brand-primary)]"
                  : "bg-muted-foreground/25",
              ].join(" ")}
            />
          ))}
        </div>

        <div
          aria-live="polite"
          aria-atomic="true"
          className="glass-surface glass-regular flex min-h-52 flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--glass-border)] p-4 text-center"
        >
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[var(--bg-brand-gradient)] text-white">
            <FantasyGuideStepIcon stepId={currentStep.id} className="h-8 w-8" />
          </div>
          <div className="text-lg font-black text-foreground">
            {t(currentStep.titleKey)}
          </div>
          <DialogDescription className="max-w-sm text-center leading-relaxed">
            {t(currentStep.bodyKey)}
          </DialogDescription>
        </div>

        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <Button
              type="button"
              variant="outline"
              size="xl"
              onClick={() =>
                setStepIndex((current) => Math.max(0, current - 1))
              }
              className="min-w-0 flex-1"
            >
              {t("fantasy.onboarding.previous")}
            </Button>
          )}
          <Button
            type="button"
            variant="premium"
            size="xl"
            onClick={advance}
            className="min-w-0 flex-1"
          >
            {isLastStep
              ? t("fantasy.onboarding.start")
              : t("fantasy.onboarding.next")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
