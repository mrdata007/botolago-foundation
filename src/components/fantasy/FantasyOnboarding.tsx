import { useState } from "react";
import { ui, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
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
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE) !== "1";
    } catch {
      return false;
    }
  });
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
          <span
            className={cn(
              "grid h-14 w-14 shrink-0 place-items-center",
              ui.radius.control,
              "text-[color:var(--ui-ink-deep)]",
            )}
            style={{ backgroundImage: "var(--ui-grad-action)" }}
            aria-hidden
          >
            <Icon className="h-7 w-7" />
          </span>
          <div className={cn(ui.text.section, ui.tone.default)}>{t(steps[step].titleKey)}</div>
          <DialogDescription className={cn("text-center", ui.text.secondary, ui.tone.muted)}>
            {t(steps[step].bodyKey)}
          </DialogDescription>
          <div className="mt-1 flex gap-1" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 w-6 transition-colors", ui.radius.full)}
                style={{
                  backgroundColor:
                    i === step
                      ? "var(--ui-ink-fg)"
                      : "color-mix(in oklab, var(--ui-on-surface-muted) 30%, transparent)",
                }}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <UiButton variant="ghost" size="sm" onClick={finish}>
            {t("fantasy.onboarding.skip")}
          </UiButton>
          <UiButton
            variant="gradient"
            size="sm"
            onClick={() => (isLast ? finish() : setStep(step + 1))}
          >
            {isLast ? t("fantasy.onboarding.start") : t("fantasy.onboarding.next")}
          </UiButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
