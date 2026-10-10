// Marks the welcome/onboarding flow completed. Only mutations that succeed
// (login, register+verify, guest continuation) should call markWelcomeDone().
//
// Since 2026-10-07 nothing in the app reads it: `/` shows Home to everyone,
// where it used to show a first-time visitor the landing page until this was
// set (docs/engineering/tasks/first-visit-home/screen-brief.md). Its writers
// (the sign-in screens, leaving `/jouer`) are kept, so the device still knows
// a newcomer from someone who has signed in or been through the landing page.
const KEY = "botolago.welcomed";

export function markWelcomeDone(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasWelcomed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}
