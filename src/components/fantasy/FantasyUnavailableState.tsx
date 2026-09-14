import { CalendarClock } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import type { FantasyUnavailableReason } from "@/services/fantasy-availability";

export function FantasyUnavailableState({ reason }: { reason: FantasyUnavailableReason }) {
  const { t } = useI18n();

  return (
    <section role="status" className="surface-4 px-5 py-8 text-center sm:px-8">
      <CalendarClock className="mx-auto h-8 w-8 text-[color:var(--brand-accent)]" aria-hidden />
      <h2 className="mt-3 text-xl font-black text-foreground">
        {t(`fantasy.availability.${reason}.title`)}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[color:var(--text-secondary)]">
        {t(`fantasy.availability.${reason}.body`)}
      </p>
    </section>
  );
}
