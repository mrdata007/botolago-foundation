import { INVITE_CODE_PATTERN } from "@/backend/predictions/contracts";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";

/**
 * League invite links (plan §9): `/pronostics/ligues/rejoindre#code=XXXX`.
 *
 * The code goes after `#`. A browser never sends that part to our server, the
 * hosting logs or the analytics tool, so the secret stays between the two
 * people. The landing page reads it once, removes it from the address bar,
 * and keeps it in sessionStorage only for the sign-up round trip (the
 * sign-in prompt keeps the path and drops everything after it).
 */
export const INVITE_PATH = "/pronostics/ligues/rejoindre";
const PENDING_KEY = "botolago.predictions.invite";

/** "0A1B …": what a person typed or pasted, as the database will compare it. */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function isInviteCode(input: string): boolean {
  return INVITE_CODE_PATTERN.test(normalizeInviteCode(input));
}

export function inviteLink(code: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : PUBLIC_SITE_ORIGIN);
  return `${base}${INVITE_PATH}#code=${encodeURIComponent(normalizeInviteCode(code))}`;
}

/** The code in a location hash ("#code=…"), or null. */
export function codeFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const code = params.get("code");
  return code && isInviteCode(code) ? normalizeInviteCode(code) : null;
}

function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Reads the code from the address bar once, removes it from there, and keeps
 * it for this tab until `clearPendingInvite`. Returns the code in hand.
 */
export function takeInviteFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const fromHash = codeFromHash(window.location.hash);
  if (fromHash) {
    try {
      session()?.setItem(PENDING_KEY, fromHash);
    } catch {
      /* blocked: the code lives in memory for this render only */
    }
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
    return fromHash;
  }
  try {
    const stored = session()?.getItem(PENDING_KEY) ?? null;
    return stored && isInviteCode(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * The code this tab holds from an invite link, without touching the address
 * bar: the Fantasy join form fills its field with it (one league, two games).
 */
export function pendingInviteCode(): string | null {
  try {
    const stored = session()?.getItem(PENDING_KEY) ?? null;
    return stored && isInviteCode(stored) ? normalizeInviteCode(stored) : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    session()?.removeItem(PENDING_KEY);
  } catch {
    /* nothing kept */
  }
}

/** The WhatsApp share URL for a message (the main channel in Morocco). */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
