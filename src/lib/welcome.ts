// Marks the welcome/onboarding flow completed. Only mutations that succeed
// (login, register+verify, guest continuation) should call markWelcomeDone().
const KEY = "botolago.welcomed";

export function markWelcomeDone(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
}

export function hasWelcomed(): boolean {
  if (typeof window === "undefined") return true;
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return true; }
}
