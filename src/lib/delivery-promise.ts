import type { NotificationPreferencesDto } from "@/backend/notifications/contracts";

/**
 * Whether this account's own settings let a reminder reach it by e-mail (audit 2026-10-14,
 * PRO-04). A saved preference is not a delivery: the account's notifications, the e-mail channel,
 * the topic and a confirmed address must all be on before copy may say the reminder e-mails are
 * on. Even then the copy states the account's SETTING, never that a message will arrive: the app
 * cannot see the global send mode (`notification_email_settings.mode`: off, test or live), the
 * sending job, or whether the provider accepted a message. That gap is recorded in
 * `docs/backend/EMAIL_NOTIFICATIONS.md` ("Known gap"). For a route that is not open the copy says
 * only what was saved, and the official deadline stays on screen.
 *
 * - `available`: every setting the account controls is on (not proof that sending is live).
 * - `email_off`: only the e-mail channel is off, which the reader can switch on from the reminder.
 * - `closed`: another setting stops it (notifications, the topic, an unconfirmed address).
 * - `unknown`: the preferences are not loaded, or could not be read.
 */
export type EmailRoute = "available" | "email_off" | "closed" | "unknown";

export function emailRoute(
  preferences: NotificationPreferencesDto | null | undefined,
  verified: boolean | undefined,
  topic: "matchAlerts" | "fantasyDeadlines",
): EmailRoute {
  if (!preferences) return "unknown";
  if (verified !== true) return "closed";
  if (!preferences.notificationsEnabled || !preferences.categories[topic]) return "closed";
  return preferences.channels.email ? "available" : "email_off";
}

/** The words a saved match reminder says, for the route it has. */
export function reminderToast(
  route: EmailRoute,
): "reminders.toast.on" | "reminders.toast.needs_email" | "reminders.toast.saved" {
  if (route === "available") return "reminders.toast.on";
  if (route === "email_off") return "reminders.toast.needs_email";
  return "reminders.toast.saved";
}
