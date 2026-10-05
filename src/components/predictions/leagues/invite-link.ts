import { INVITE_CODE_PATTERN } from "@/backend/predictions/contracts";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";

/**
 * League invite links (plan §9): `/pronostics/ligues/rejoindre#code=XXXX`,
 * optionally `&game=fantasy` or `&game=predictions`.
 *
 * The code goes after `#`. A browser never sends that part to our server, the
 * hosting logs or the analytics tool, so the secret stays between the two
 * people. The landing page reads it once and removes it from the address bar.
 *
 * `game` says which game the sender invited from (one league serves both), so
 * the landing page can lead to the right join. It is not a secret and not
 * required: links made before it existed carry none and still work.
 *
 * Until the recipient joins, the invite is kept on this device for
 * `INVITE_RECOVERY_MS`, so it survives the sign-up round trip even when the
 * confirmation e-mail opens a new tab. It is cleared on a join, on a code the
 * server refuses, and once it expires. Nothing joins on its own: the
 * recipient always taps "Rejoindre".
 */
export const INVITE_PATH = "/pronostics/ligues/rejoindre";
/** Version 1: JSON `{ v: 1, code, game, savedAt }` in localStorage. */
const PENDING_KEY = "botolago.league-invite.v1";
/** Before version 1: the bare code, in this tab's sessionStorage. Still read. */
const LEGACY_PENDING_KEY = "botolago.predictions.invite";
/** How long a pending invite is kept on the device: a day. */
export const INVITE_RECOVERY_MS = 24 * 60 * 60 * 1000;

export type InviteGame = "fantasy" | "predictions";

export interface PendingInvite {
  code: string;
  /** The game the link was shared from, or null for a link that names none. */
  game: InviteGame | null;
}

/** "0A1B …": what a person typed or pasted, as the database will compare it. */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function isInviteCode(input: string): boolean {
  return INVITE_CODE_PATTERN.test(normalizeInviteCode(input));
}

export function inviteLink(code: string, origin?: string, game?: InviteGame): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : PUBLIC_SITE_ORIGIN);
  const tail = game ? `&game=${game}` : "";
  return `${base}${INVITE_PATH}#code=${encodeURIComponent(normalizeInviteCode(code))}${tail}`;
}

function gameOf(value: unknown): InviteGame | null {
  return value === "fantasy" || value === "predictions" ? value : null;
}

/** The invite in a location hash ("#code=…&game=…"), or null. */
export function inviteFromHash(hash: string): PendingInvite | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const code = params.get("code");
  if (!code || !isInviteCode(code)) return null;
  return { code: normalizeInviteCode(code), game: gameOf(params.get("game")) };
}

/** The code in a location hash ("#code=…"), or null. */
export function codeFromHash(hash: string): string | null {
  return inviteFromHash(hash)?.code ?? null;
}

function storage(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind] ?? null;
  } catch {
    return null;
  }
}

function save(invite: PendingInvite, now: number): void {
  try {
    storage("localStorage")?.setItem(
      PENDING_KEY,
      JSON.stringify({ v: 1, code: invite.code, game: invite.game, savedAt: now }),
    );
  } catch {
    /* blocked: the invite lives in memory for this page only */
  }
}

/** The invite kept on this device, if it is still fresh. */
export function pendingInvite(now = Date.now()): PendingInvite | null {
  try {
    const raw = storage("localStorage")?.getItem(PENDING_KEY) ?? null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{
        v: number;
        code: string;
        game: string;
        savedAt: number;
      }>;
      const fresh =
        parsed.v === 1 &&
        typeof parsed.savedAt === "number" &&
        now - parsed.savedAt >= 0 &&
        now - parsed.savedAt < INVITE_RECOVERY_MS;
      if (fresh && typeof parsed.code === "string" && isInviteCode(parsed.code)) {
        return { code: normalizeInviteCode(parsed.code), game: gameOf(parsed.game) };
      }
      clearPendingInvite();
      return null;
    }
  } catch {
    /* unreadable or malformed: fall through to the legacy key */
  }
  try {
    const legacy = storage("sessionStorage")?.getItem(LEGACY_PENDING_KEY) ?? null;
    return legacy && isInviteCode(legacy)
      ? { code: normalizeInviteCode(legacy), game: null }
      : null;
  } catch {
    return null;
  }
}

/**
 * Reads the invite from the address bar once, removes it from there, and
 * keeps it on this device until it is used, refused or expires. Without one
 * in the address bar, the invite already kept. Joins nothing.
 */
export function takeInviteFromLocation(now = Date.now()): PendingInvite | null {
  if (typeof window === "undefined") return null;
  const fromHash = inviteFromHash(window.location.hash);
  if (fromHash) {
    save(fromHash, now);
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
    return fromHash;
  }
  return pendingInvite(now);
}

/**
 * The code this device holds from an invite link, without touching the
 * address bar: the Fantasy join form fills its field with it (one league, two
 * games).
 */
export function pendingInviteCode(now = Date.now()): string | null {
  return pendingInvite(now)?.code ?? null;
}

export function clearPendingInvite(): void {
  try {
    storage("localStorage")?.removeItem(PENDING_KEY);
  } catch {
    /* nothing kept */
  }
  try {
    storage("sessionStorage")?.removeItem(LEGACY_PENDING_KEY);
  } catch {
    /* nothing kept */
  }
}

/** The WhatsApp share URL for a message (the main channel in Morocco). */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
