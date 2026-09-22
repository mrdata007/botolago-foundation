import { useState } from "react";
import { ui, UiButton, UiModal } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Trophy, Target, Users } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";

const STORAGE = "botolago.fantasy.onboarded";

/**
 * The three-step first-run modal.
 *
 * On `UiModal` rather than the V1 shadcn `Dialog`, which was out of the system
 * in five separate ways the kit forbids by name: a close control labelled with
 * a hardcoded English "Close"; that control drawn `h-9 w-9`, 36px against the
 * 44px floor; a `bg-black/45` literal scrim instead of `--ui-scrim`; the V1
 * palette (`--background-elevated`, `--border-subtle`, `--radius-dialog`,
 * `--shadow-dialog`, and a focus ring in `--brand-accent`); and physical
 * `left-[50%] translate-x-[-50%]` centring. `UiModal` is the same Radix dialog
 * — focus trapped, Escape closes, page behind inert — with the close control
 * labelled `t("fpl.close")` and every surface on a token.
 *
 * ONE THING MOVED, DELIBERATELY. The step body was a `DialogDescription`
 * sitting under the step title inside the centred column. `UiModal`'s
 * `description` slot is positionally fixed in the header, so it now renders
 * under the modal title instead. That is a layout change and it is the lesser
 * of the two available losses: the alternative — keeping the body in the
 * column with no `description` prop — silently drops the dialog's accessible
 * description, and this migration may reorder a box but may not remove an
 * announcement. The copy itself is untouched, and the dialog still opens
 * announcing title + step-one body exactly as it did.
 *
 * The kit gap behind that trade: `UiModal` has no slot for a body that is both
 * the dialog's description and part of the content column.
 */

/**
 * The step indicator. `aria-hidden` because the dots restate a position the
 * buttons already carry, and a decorative row of spans has no accessible
 * meaning to restate it with.
 */
function StepDots({ count, current }: { count: number; current: number }) {
  return (
    <div className="mt-1 flex gap-1" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn("h-1.5 w-6 transition-colors", ui.radius.full)}
          style={{
            backgroundColor:
              i === current
                ? "var(--ui-ink-fg)"
                : "color-mix(in oklab, var(--ui-on-surface-muted) 30%, transparent)",
          }}
        />
      ))}
    </div>
  );
}

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
    <UiModal
      open={open}
      onOpenChange={(v) => !v && finish()}
      title={t("fantasy.onboarding.title")}
      description={t(steps[step].bodyKey)}
      footer={
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
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
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
        <StepDots count={steps.length} current={step} />
      </div>
    </UiModal>
  );
}
