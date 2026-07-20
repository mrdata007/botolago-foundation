import { NotificationError } from "./errors";

export interface QuietHoursInput {
  readonly enabled: boolean;
  readonly start: string | null;
  readonly end: string | null;
  readonly timezone: string;
  readonly bypass?: boolean;
}

function localMinutes(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute))
    throw new NotificationError(
      "quiet_hours_invalid",
      "Unable to resolve the notification timezone.",
    );
  return hour * 60 + minute;
}

function parseClock(value: string | null): number {
  if (!value || !/^\d{2}:\d{2}$/.test(value))
    throw new NotificationError("quiet_hours_invalid", "Quiet hours require HH:MM values.");
  const [hour, minute] = value.split(":").map(Number);
  if (hour! > 23 || minute! > 59)
    throw new NotificationError("quiet_hours_invalid", "Quiet hours contain an invalid time.");
  return hour! * 60 + minute!;
}

export function isWithinQuietHours(at: Date, input: QuietHoursInput): boolean {
  if (!input.enabled || input.bypass) return false;
  const start = parseClock(input.start);
  const end = parseClock(input.end);
  if (start === end)
    throw new NotificationError("quiet_hours_invalid", "Quiet-hour boundaries must differ.");
  const current = localMinutes(at, input.timezone);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/** Minute scanning deliberately delegates DST gaps/folds to Intl/tzdata. */
export function nextAllowedDelivery(at: Date, input: QuietHoursInput): Date {
  if (!isWithinQuietHours(at, input)) return at;
  for (let offset = 1; offset <= 26 * 60; offset++) {
    const candidate = new Date(at.getTime() + offset * 60_000);
    if (!isWithinQuietHours(candidate, input)) return candidate;
  }
  throw new NotificationError(
    "quiet_hours_invalid",
    "Quiet hours did not produce a delivery window.",
  );
}
