/**
 * Operational error reporting: what failed, where, when, on which release and
 * route -- never who, and never what they typed.
 *
 * A handled failure (a refusal the UI turned into words) and an unhandled one
 * (an exception nothing caught) both go through `reportOperationalError`. The
 * event carries a stable machine code and a small allow-listed detail map; the
 * user sees a sentence, the operator sees the code. Every event is written to
 * the console as one JSON line and handed to the transport installed by
 * `setOperationalTransport` (the client error sink), if any. Reporting never
 * throws and never blocks the caller.
 */

export type OperationalDetailValue = string | number | boolean | null;
export type OperationalDetail = Record<string, OperationalDetailValue>;

export interface OperationalEvent {
  /** `handled`: the UI recovered and told the user; `unhandled`: nothing caught it. */
  kind: "handled" | "unhandled";
  /** Where it happened, dotted: `fantasy.create_team`, `window.error`, … */
  area: string;
  /** Stable machine code: `fantasy_gameweek_locked`, `TypeError`, … */
  code: string;
  detail: OperationalDetail;
  /** Path only; query and hash can carry tokens and are dropped. */
  route: string | null;
  release: string;
  at: string;
}

type Transport = (event: OperationalEvent) => void;

let transport: Transport | null = null;

/** Install (or clear) the sink every later event is handed to. */
export function setOperationalTransport(next: Transport | null): void {
  transport = next;
}

const MAX_TEXT = 200;
const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;

/**
 * Strip what could identify a person or open an account from free text:
 * e-mail addresses, bearer/JWT-looking tokens, long hex or base64 runs, UUIDs
 * and URLs' query strings.
 */
export function redactText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[jwt]")
    .replace(/\b(bearer|token|apikey|key|secret|password)\b\s*[:=]?\s*\S+/gi, "$1 [redacted]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[uuid]")
    .replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}/g, "[redacted]")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, "$1")
    .slice(0, MAX_TEXT);
}

function safeCode(code: string): string {
  return CODE_PATTERN.test(code) ? code : "unclassified";
}

function safeDetail(detail: OperationalDetail | undefined): OperationalDetail {
  const out: OperationalDetail = {};
  if (!detail) return out;
  for (const [key, value] of Object.entries(detail).slice(0, 12)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) continue;
    out[key] = typeof value === "string" ? redactText(value) : value;
  }
  return out;
}

function currentRoute(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname.slice(0, MAX_TEXT);
}

/** The build's release identifier (git SHA when the build knows it). */
export function currentRelease(): string {
  const value = import.meta.env?.VITE_RELEASE_SHA;
  return typeof value === "string" && /^[0-9a-f]{7,40}$/.test(value) ? value : "unknown";
}

function emit(event: OperationalEvent): void {
  try {
    console.error(`[ops] ${JSON.stringify(event)}`);
  } catch {
    // Console unavailable: nothing to do.
  }
  try {
    transport?.(event);
  } catch {
    // A failing sink must never break the page that reported the failure.
  }
}

/** A failure the UI handled and explained to the user. */
export function reportOperationalError(
  area: string,
  code: string,
  detail?: OperationalDetail,
): void {
  emit({
    kind: "handled",
    area: safeCode(area),
    code: safeCode(code),
    detail: safeDetail(detail),
    route: currentRoute(),
    release: currentRelease(),
    at: new Date().toISOString(),
  });
}

/** An exception nothing caught. The message is redacted and truncated. */
export function reportUnhandledError(area: string, error: unknown): void {
  const name =
    error instanceof Error ? error.name : typeof error === "string" ? "StringError" : "Unknown";
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  emit({
    kind: "unhandled",
    area: safeCode(area),
    code: safeCode(name),
    detail: { message: redactText(message) },
    route: currentRoute(),
    release: currentRelease(),
    at: new Date().toISOString(),
  });
}
