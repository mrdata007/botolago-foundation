import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy, Target, Users } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";

const STORAGE = "botolago.fantasy.onboarded";

export function FantasyOnboarding() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STORAGE) !== "1");
    } catch {
      setOpen(false);
    }
  }, []);
  const [step, setStep] = useState(0);

  const steps: {
    icon: React.ComponentType<{ className?: string }>;
    titleKey: TranslationKey;
    bodyKey: TranslationKey;
  }[] = [
    {
      icon: Trophy,
      titleKey: "fantasy.onboarding.step1_title",
      bodyKey: "fantasy.onboarding.step1_body",
    },
    {
      icon: Target,
      titleKey: "fantasy.onboarding.step2_title",
      bodyKey: "fantasy.onboarding.step2_body",
    },
    {
      icon: Users,
      titleKey: "fantasy.onboarding.step3_title",
      bodyKey: "fantasy.onboarding.step3_body",
    },
  ];

  const finish = () => {
    try {
      window.localStorage.setItem(STORAGE, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const isLast = step === steps.length - 1;
  const Icon = steps[step].icon;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && finish()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("fantasy.onboarding.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-3 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--bg-brand-gradient)] text-white">
            <Icon className="h-7 w-7" aria-hidden />
          </div>
          <div className="text-base font-black text-foreground">{t(steps[step].titleKey)}</div>
          <DialogDescription className="text-sm text-muted-foreground">
            {t(steps[step].bodyKey)}
          </DialogDescription>
          <div className="mt-1 flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors ${i === step ? "bg-[color:var(--brand-primary)]" : "bg-muted-foreground/30"}`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={finish}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("fantasy.onboarding.skip")}
          </button>
          <button
            onClick={() => (isLast ? finish() : setStep(step + 1))}
            className="rounded-xl cta-brand px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            {isLast ? t("fantasy.onboarding.start") : t("fantasy.onboarding.next")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
