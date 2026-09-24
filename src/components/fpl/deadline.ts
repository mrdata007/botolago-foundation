import { useEffect, useState } from "react";

import type { TranslationKey } from "@/i18n/dictionaries";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import type { Language } from "@/types/domain";

/**
 * A gameweek deadline, formatted on the competition's own calendar.
 *
 * `timeZone: MATCH_TIME_ZONE` is the whole point (BG-0100): without it the
 * formatter follows the viewer's browser, and the deadline disagrees with every
 * kickoff on the screen for anyone outside Morocco. The hub, Pick Team, the
 * squad builder and the transfer confirmation each spelled this formatter out
 * on their own; this is that formatter once.
 */
export function formatDeadline(
  deadlineIso: string,
  lang: Language,
  options: { weekday?: "short" | "long" } = {},
): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    ...(options.weekday ? { weekday: options.weekday } : {}),
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MATCH_TIME_ZONE,
  }).format(new Date(deadlineIso));
}

export interface DeadlineCountdown {
  days: number;
  hours: number;
  minutes: number;
  /** The deadline is behind us: the team is locked, there is nothing to count down to. */
  passed: boolean;
}

/**
 * What is left before a deadline, in whole days, hours and minutes. `null`
 * for a date that does not parse, so a bad value renders nothing rather than
 * "NaNj NaNh".
 */
export function deadlineCountdown(deadlineIso: string, now: number): DeadlineCountdown | null {
  const target = Date.parse(deadlineIso);
  if (Number.isNaN(target)) return null;
  const left = target - now;
  if (left <= 0) return { days: 0, hours: 0, minutes: 0, passed: true };
  return {
    days: Math.floor(left / 86_400_000),
    hours: Math.floor((left % 86_400_000) / 3_600_000),
    minutes: Math.floor((left % 3_600_000) / 60_000),
    passed: false,
  };
}

/**
 * The countdown as the product writes it, to the minute: "1j 13h 59min". The
 * day part drops out on the last day rather than reading "0j". One spelling
 * for Home's pill, the Fantasy hub and Pick Team, which had three.
 */
export function countdownText(
  left: Pick<DeadlineCountdown, "days" | "hours" | "minutes">,
  t: (key: TranslationKey) => string,
): string {
  const days = left.days > 0 ? `${left.days}${t("home.days")} ` : "";
  return `${days}${left.hours}${t("home.hours")} ${left.minutes}${t("home.minutes")}`;
}

/**
 * The countdown, re-read every 30 seconds.
 *
 * `null` until the component has mounted. The answer depends on the clock,
 * and the server render and the hydrating client read two different clocks —
 * the minute can roll over between them, and React then throws away the
 * server HTML with a hydration error. Rendering nothing on the server and the
 * countdown from the first client effect costs one frame and cannot mismatch.
 */
export function useDeadlineCountdown(
  deadlineIso: string | null | undefined,
): DeadlineCountdown | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!deadlineIso) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [deadlineIso]);
  return deadlineIso && now !== null ? deadlineCountdown(deadlineIso, now) : null;
}
