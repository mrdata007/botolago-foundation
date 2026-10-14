import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";

import { ui, UiCard } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { usePremium } from "@/services/use-premium";

import { useNow, usePlusCopy } from "./plus-copy";
import { DateText } from "./plus-text";
import { renewalReminderDue } from "./plus-pricing";

/**
 * The J-3 reminder: « Ton abonnement se renouvelle le {date} », three days or fewer before a
 * monthly renewal (`renewalReminderDue`), with the way to Profil where it can be cancelled.
 * Presentation only: the push or e-mail reminder is lane F's.
 */
export function PlusRenewalBanner({ renewsOn }: { renewsOn: Date }) {
  const { f, t } = usePlusCopy();
  return (
    <UiCard padding="sm" data-testid="plus-renewal-banner">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center",
            ui.radius.full,
            ui.surface.sunken,
            ui.tone.ink,
          )}
        >
          <CalendarClock className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-pretty", ui.text.bodyStrong, ui.tone.default)}>
            {f("plus.reminder.title", { date: <DateText date={renewsOn} /> })}
          </p>
          <p className={cn("text-pretty", ui.text.meta, ui.tone.muted)}>
            {t("plus.reminder.body")}
          </p>
        </div>
        <Link
          to="/profile"
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center px-3",
            ui.text.bodyStrong,
            ui.tone.ink,
            "underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-ink-fg)]",
          )}
        >
          {t("plus.reminder.cta")}
        </Link>
      </div>
    </UiCard>
  );
}

/** The banner, bound to the reader's membership: nothing unless a monthly renewal is due. */
export function PlusRenewalReminder() {
  const premium = usePremium();
  const now = useNow();
  const { due } = renewalReminderDue({
    productCode: premium.productCode,
    state: premium.state,
    cancelling: premium.cancelling,
    periodEnd: premium.periodEnd,
    now,
  });
  if (!premium.ready || !premium.enabled || !due || premium.periodEnd === null) return null;
  return <PlusRenewalBanner renewsOn={premium.periodEnd} />;
}
