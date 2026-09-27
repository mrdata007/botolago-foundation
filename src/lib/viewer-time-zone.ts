import { useSyncExternalStore } from "react";
import { MATCH_TIME_ZONE, matchDayKey } from "@/lib/match-kickoff";

/** The server and the first hydration render agree; the browser then supplies its zone. */
function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return zone;
    }
  } catch {
    // Some privacy settings omit the device zone.
  }
  return MATCH_TIME_ZONE;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("focus", onChange);
  window.addEventListener("pageshow", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    window.removeEventListener("pageshow", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

export function useViewerTimeZone(): string {
  return useSyncExternalStore(subscribe, browserTimeZone, () => MATCH_TIME_ZONE);
}

/** Used only for display; match-day queries remain on the Morocco calendar. */
export function localMatchDayKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const field = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${field("year")}-${field("month")}-${field("day")}`;
}

export function differsFromMatchDay(iso: string, timeZone: string): boolean {
  return localMatchDayKey(iso, timeZone) !== matchDayKey(new Date(iso));
}

export function timeZoneLabel(timeZone: string): string {
  return timeZone.split("/").pop()?.replaceAll("_", " ") ?? timeZone;
}
