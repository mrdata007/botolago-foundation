import {
  AlarmClock,
  Ban,
  CalendarX,
  CircleDot,
  Flag,
  Gem,
  Goal,
  Info,
  Newspaper,
  ShieldCheck,
  Swords,
  Timer,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import type { NotificationCategory } from "@/backend/notifications/contracts";

/**
 * What a notification announces, read from its `type` (the server's event
 * name: `goal`, `match_starting`, `deadline_24h`, `matchday_results`,
 * `rival_lead_change`, …) and falling back on its category for a type this
 * screen does not know yet. Only the badge's colour and icon depend on it;
 * the card's text, link and read state come from the server unchanged.
 */
export type NotificationKind =
  | "goal"
  | "goal_cancelled"
  | "kickoff"
  | "match_off"
  | "results"
  | "deadline"
  | "rival"
  | "rating"
  | "fantasy"
  | "pepites"
  | "news"
  | "football"
  | "account"
  | "system";

export function notificationKind(type: string, category: NotificationCategory): NotificationKind {
  if (type === "goal_cancelled") return "goal_cancelled";
  if (type === "goal" || type.startsWith("goal_")) return "goal";
  if (type === "match_cancelled" || type === "match_postponed") return "match_off";
  if (
    type === "match_starting" ||
    type === "match_started" ||
    type === "matchday_preview" ||
    type.includes("kickoff")
  )
    return "kickoff";
  if (type.includes("result")) return "results";
  if (type.includes("deadline")) return "deadline";
  if (type.startsWith("rival")) return "rival";
  if (type.startsWith("manager_card")) return "rating";
  if (type.startsWith("pepites")) return "pepites";
  switch (category) {
    case "fantasy":
      return "fantasy";
    case "news":
      return "news";
    case "football":
      return "football";
    case "account":
    case "security":
      return "account";
    default:
      return "system";
  }
}

/**
 * The badge of each kind: an icon on a filled disc, painted only with theme
 * tokens and the foreground each fill is paired with. Icons are graphics, so
 * the bar is 3:1; every pair below clears it in both themes (the violet and
 * the live red take the deep ink in the dark theme, where they are lighter).
 */
export const NOTIFICATION_BADGE: Record<NotificationKind, { icon: LucideIcon; className: string }> =
  {
    goal: {
      icon: Goal,
      className: "bg-[color:var(--ui-positive)] text-[color:var(--ui-on-positive)]",
    },
    goal_cancelled: {
      icon: Ban,
      className: "bg-[color:var(--ui-negative)] text-[color:var(--ui-on-negative)]",
    },
    kickoff: {
      icon: Timer,
      className:
        "bg-[color:var(--ui-live)] text-[color:var(--ui-on-ink-plain)] dark:text-[color:var(--ui-ink-deep)]",
    },
    match_off: {
      icon: CalendarX,
      className: "bg-[color:var(--ui-caution)] text-[color:var(--ui-on-caution)]",
    },
    results: {
      icon: Flag,
      className: "[background-image:var(--ui-grad-header)] text-[color:var(--ui-on-grad-header)]",
    },
    deadline: {
      icon: AlarmClock,
      className: "bg-[color:var(--ui-caution)] text-[color:var(--ui-on-caution)]",
    },
    rival: {
      icon: Swords,
      className:
        "bg-[color:var(--ui-wash-news)] text-[color:var(--ui-on-ink-plain)] dark:text-[color:var(--ui-ink-deep)]",
    },
    rating: {
      icon: TrendingUp,
      className: "bg-[color:var(--ui-ink)] text-[color:var(--ui-on-ink)]",
    },
    fantasy: {
      icon: Trophy,
      className: "[background-image:var(--ui-grad-action)] text-[color:var(--ui-ink-deep)]",
    },
    pepites: {
      icon: Gem,
      className: "[background-image:var(--ui-grad-action)] text-[color:var(--ui-ink-deep)]",
    },
    news: {
      icon: Newspaper,
      className:
        "bg-[color:var(--ui-wash-news)] text-[color:var(--ui-on-ink-plain)] dark:text-[color:var(--ui-ink-deep)]",
    },
    football: {
      icon: CircleDot,
      className: "bg-[color:var(--ui-wash-matches)] text-[color:var(--ui-ink-deep)]",
    },
    account: {
      icon: ShieldCheck,
      className: "bg-[color:var(--ui-ink)] text-[color:var(--ui-on-ink-plain)]",
    },
    system: {
      icon: Info,
      className: "bg-[color:var(--ui-ink)] text-[color:var(--ui-on-ink)]",
    },
  };
