/**
 * What the Manager Card remembers on the phone (plan sections 4 and 5). Each key is read and
 * written inside try/catch: storage throws in a private window or with site data blocked, and the
 * card must still work. A thing remembered here is a convenience, never the truth: the server's
 * acknowledgements and the card read are.
 *
 * "Blocked storage counts as seen" (the PrizeWelcome rule): when a hint's flag cannot be read, it
 * reads as already seen, so a phone that cannot remember never gets nagged.
 */
export const DEVICE_KEYS = {
  /** The guest's card was made (the `make` beat) once on this phone. */
  guestMake: "botolago.card.guest_make.v1",
  /** The highest counted-journée total whose mark has been lit in view (`tick`). */
  tick: "botolago.card.tick.v1",
  /** The face-à-face hint on « Les vôtres » was shown. */
  compareHint: "botolago.card.compare_hint.v1",
  /** Moment keys acknowledged here, so nothing flashes back while the call is in flight. */
  moments: "botolago.card.moments.v1",
  /** The league « Les vôtres » last showed. */
  league: "botolago.curva.league.v1",
  /** The three stat hints (plan M3e). */
  hintCap: "botolago.card.hint.cap.v1",
  hintSel: "botolago.card.hint.sel.v1",
  hintTrf: "botolago.card.hint.trf.v1",
} as const;
export type DeviceKey = (typeof DEVICE_KEYS)[keyof typeof DEVICE_KEYS];

export const SESSION_KEYS = {
  /** One hero (or the born panel) per session, on any surface. */
  hero: "botolago.card.hero_session.v1",
} as const;
export type SessionKey = (typeof SESSION_KEYS)[keyof typeof SESSION_KEYS];

/** Most acknowledged keys kept on a phone; the oldest go first. */
const MAX_ACKED_KEYS = 64;

function local(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readDevice(key: DeviceKey): string | null {
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Whether the value was kept. */
export function writeDevice(key: DeviceKey, value: string): boolean {
  try {
    const storage = local();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeDevice(key: DeviceKey): void {
  try {
    local()?.removeItem(key);
  } catch {
    /* blocked: nothing to forget */
  }
}

/**
 * Whether a once-only thing was already shown on this phone. Blocked or missing storage reads as
 * seen, and so does the server, which never shows one.
 */
export function hasSeen(key: DeviceKey): boolean {
  try {
    const storage = local();
    if (!storage) return true;
    return storage.getItem(key) === "1";
  } catch {
    return true;
  }
}

export function markSeen(key: DeviceKey): void {
  writeDevice(key, "1");
}

/** The counted-journée total the phone last saw lit; 0 when it has seen none. */
export function readTick(): number {
  const raw = Number(readDevice(DEVICE_KEYS.tick));
  return Number.isInteger(raw) && raw > 0 ? raw : 0;
}

export function writeTick(counted: number): void {
  if (Number.isInteger(counted) && counted >= 0) writeDevice(DEVICE_KEYS.tick, String(counted));
}

export function readRememberedLeague(): string | null {
  const value = readDevice(DEVICE_KEYS.league);
  return value && /^[0-9a-f-]{8,64}$/i.test(value) ? value : null;
}

export function rememberLeague(leagueId: string): void {
  writeDevice(DEVICE_KEYS.league, leagueId);
}

/**
 * The moment keys this phone has acknowledged for one account (newest last). Some keys are the
 * same for everyone (`card_created`, `founder_granted`), so each is stored with the account it
 * belongs to: a second manager on the same phone still sees their own first moments.
 */
export function readAckedMoments(scope = ""): string[] {
  const prefix = `${scope}|`;
  try {
    const parsed: unknown = JSON.parse(readDevice(DEVICE_KEYS.moments) ?? "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter((entry): entry is string => typeof entry === "string" && entry.startsWith(prefix))
          .map((entry) => entry.slice(prefix.length))
      : [];
  } catch {
    return [];
  }
}

/** Remember acknowledged keys before the network call, so a reload cannot show them again. */
export function rememberAckedMoments(keys: readonly string[], scope = ""): void {
  let all: string[] = [];
  try {
    const parsed: unknown = JSON.parse(readDevice(DEVICE_KEYS.moments) ?? "[]");
    if (Array.isArray(parsed))
      all = parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    all = [];
  }
  const merged = [...new Set([...all, ...keys.map((key) => `${scope}|${key}`)])].slice(
    -MAX_ACKED_KEYS,
  );
  writeDevice(DEVICE_KEYS.moments, JSON.stringify(merged));
}

// Where sessionStorage is blocked the flag lives here, so one hero per session still holds for
// as long as the page does.
let heroShownInMemory = false;

/** Whether a hero or the born panel was already shown in this session. */
export function heroShownThisSession(): boolean {
  if (heroShownInMemory) return true;
  try {
    return session()?.getItem(SESSION_KEYS.hero) === "1";
  } catch {
    return false;
  }
}

export function markHeroShown(): void {
  heroShownInMemory = true;
  try {
    session()?.setItem(SESSION_KEYS.hero, "1");
  } catch {
    /* blocked: the in-memory flag stands */
  }
}

/** For tests only: forget the in-memory flag. */
export function resetHeroSessionForTests(): void {
  heroShownInMemory = false;
}
