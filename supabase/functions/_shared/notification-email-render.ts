// Notification e-mail renderer.
//
// Turns one claimed delivery (the contract is notification-email-types.ts)
// into the subject, preheader, HTML body and plain-text body the dispatcher
// hands the provider. Six types x two languages (French, Arabic RTL).
//
// Pure and dependency-free on purpose: it runs under Bun (its tests and
// scripts/backend/notification-email-previews.ts) and under Deno (the Edge
// Function), so it imports nothing but the contract, relatively and with the
// `.ts` extension Deno requires.
//
// Every string in a delivery is data from the database. The HTML escapes all
// of it; the subject, preheader and plain text strip control and bidi-override
// characters, so a CR/LF in a club name can never reach a header and an RLO in
// a display name cannot reorder the sentence around it. Links go only to the
// routes built in `links()` below.
//
// Each email is described once, as an `EmailContent`, and both bodies are
// rendered from that one description, so the plain text carries everything
// the HTML does.

import type {
  ClaimedEmailDelivery,
  DeadlinePayload,
  EmailFixture,
  EmailLanguage,
  EmailLinkContext,
  EmailTeam,
  GameweekFinalizedPayload,
  MatchStartingPayload,
  MatchdayPreviewPayload,
  MatchdayResultsPayload,
  RenderedEmail,
  RoundPreviewPayload,
} from "./notification-email-types.ts";

/** The zone times are shown in when a delivery carries none (or an invalid one). */
export const DEFAULT_EMAIL_TIME_ZONE = "Africa/Casablanca";

/**
 * The competition calendar. A fixture whose time is not confirmed carries the
 * provider's 00:00 UTC placeholder; its DAY is real in the competition's
 * calendar, so it is read there rather than in the reader's zone, where a
 * placeholder midnight would land on the previous day west of Greenwich.
 */
const COMPETITION_TIME_ZONE = "Africa/Casablanca";

/**
 * Brand colours as hex, converted from the oklch tokens in src/styles.css
 * (e-mail clients do not parse oklch). Contrast measured on the sRGB values:
 * white on `ink` 12.8:1, `onInk` on `ink` 9.3:1, `text` on white 19.4:1,
 * `muted` on white 7.4:1 and on `page` 6.9:1.
 */
export const EMAIL_COLORS = {
  /** --brand-primary / --ui-ink, oklch(0.32 0.1 258): header band, button, links. */
  ink: "#0c3164",
  /** --ui-on-ink, oklch(0.88 0.11 205): the cyan on an ink fill ("GO"). */
  onInk: "#73edfa",
  /** --brand-accent, oklch(0.62 0.19 256): borders only, never text. */
  accent: "#2584f5",
  /** --brand-accent at 10% over white: the favourite-club row. */
  favoriteTint: "#e9f3fe",
  /** --ui-page, oklch(0.975 0.004 250). */
  page: "#f5f7f9",
  /** --ui-surface. */
  surface: "#ffffff",
  /** --ui-on-surface, oklch(0.16 0.03 260). */
  text: "#060d1a",
  /** --ui-on-surface-muted, oklch(0.45 0.02 258). */
  muted: "#4e5661",
  /** --ui-rule, oklch(0.93 0.006 250). */
  rule: "#e5e8ec",
} as const;

const C = EMAIL_COLORS;

// System faces only: no web fonts in e-mail. The Arabic stack puts faces with
// good Arabic coverage first; Arabic is never letter-spaced anywhere here.
const FONT_LATIN = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FONT_ARABIC = "'Segoe UI',Tahoma,'Noto Sans Arabic','Geeza Pro',Arial,sans-serif";

/* ------------------------------------------------------------------ */
/* Text safety                                                         */
/* ------------------------------------------------------------------ */

/** Escapes the five characters that matter in HTML text and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isStrippedCodePoint(code: number): boolean {
  return (
    code < 0x20 || // C0 controls, including CR and LF
    (code >= 0x7f && code <= 0x9f) || // DEL and C1 controls
    code === 0x2028 ||
    code === 0x2029 || // line / paragraph separators
    (code >= 0x202a && code <= 0x202e) || // bidi embeddings and overrides
    (code >= 0x2066 && code <= 0x2069) // bidi isolates
  );
}

/** One line of plain text: no control or bidi-override characters, collapsed spaces. */
function cleanText(value: unknown, maxLength = 200): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const ch of value) out += isStrippedCodePoint(ch.codePointAt(0) ?? 0) ? " " : ch;
  out = out.replace(/\s+/g, " ").trim();
  return out.length > maxLength ? `${out.slice(0, maxLength - 1).trimEnd()}…` : out;
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

function appOrigin(links: EmailLinkContext): string {
  const raw = (typeof links?.appUrl === "string" ? links.appUrl : "").trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("notification email: links.appUrl is not a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("notification email: links.appUrl must be an http(s) URL");
  }
  if (parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error("notification email: links.appUrl must be a bare origin");
  }
  return raw;
}

/**
 * The one-click unsubscribe page for this delivery. The dispatcher also puts
 * it in the List-Unsubscribe header, so it is exported and built exactly as
 * the footer builds it.
 */
export function unsubscribeUrl(delivery: ClaimedEmailDelivery, links: EmailLinkContext): string {
  return `${appOrigin(links)}/unsubscribe?token=${encodeURIComponent(delivery.unsubscribeToken)}`;
}

/** Every route an e-mail may link to. Nothing else is ever built. */
function linksFor(app: string) {
  return {
    matches: `${app}/matches`,
    match: (fixtureId: string) => `${app}/matches/${encodeURIComponent(fixtureId)}`,
    fantasyTransfers: `${app}/fantasy/transfers`,
    fantasyPoints: `${app}/fantasy/points`,
    profile: `${app}/profile`,
  };
}

/* ------------------------------------------------------------------ */
/* Dates, times and numbers                                            */
/* ------------------------------------------------------------------ */

function intlLocale(lang: EmailLanguage): string {
  // Latin digits in both languages, as the app shows them.
  return lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR";
}

/** The delivery's zone when Intl knows it, else Africa/Casablanca. */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (typeof timeZone === "string" && timeZone.trim().length > 0) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timeZone.trim() });
      return timeZone.trim();
    } catch {
      // RangeError: unknown zone. Fall through to the default.
    }
  }
  return DEFAULT_EMAIL_TIME_ZONE;
}

function parseInstant(value: string): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

/** "21:00" — 24-hour clock, Latin digits. */
export function formatTime(instant: Date, lang: EmailLanguage, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  }).format(instant);
}

/** "samedi 26 septembre" / "السبت، 26 شتنبر". */
export function formatDay(instant: Date, lang: EmailLanguage, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    numberingSystem: "latn",
  }).format(instant);
}

function dayKey(instant: Date, timeZone: string): string {
  const parts: Record<string, string> = {};
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  for (const part of format.formatToParts(instant)) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** A `YYYY-MM-DD` calendar date, formatted without any zone shifting it. */
function formatCalendarDate(value: string, lang: EmailLanguage): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === "string" ? value : "");
  if (!match) return null;
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return Number.isFinite(instant.getTime()) ? formatDay(instant, lang, "UTC") : null;
}

function formatNumber(value: number, lang: EmailLanguage): string {
  return new Intl.NumberFormat(intlLocale(lang), { maximumFractionDigits: 1 }).format(value);
}

/** Upper-cases the first letter of a French standalone line ("Samedi 26 septembre"). */
function capitalize(value: string, lang: EmailLanguage): string {
  return lang === "fr" && value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/* ------------------------------------------------------------------ */
/* Language                                                            */
/* ------------------------------------------------------------------ */

interface RenderContext {
  readonly lang: EmailLanguage;
  readonly dir: "ltr" | "rtl";
  /** The physical side text starts on: e-mail clients do not honour `start`. */
  readonly start: "left" | "right";
  readonly end: "left" | "right";
  readonly font: string;
  readonly lineHeight: string;
  readonly timeZone: string;
  readonly favoriteTeamId: string | null;
}

function t(ctx: RenderContext, fr: string, ar: string): string {
  return ctx.lang === "ar" ? ar : fr;
}

/** "Label : valeur" in French typography, "التسمية: القيمة" in Arabic. */
function labelled(ctx: RenderContext, label: string, value: string): string {
  return ctx.lang === "ar" ? `${label}: ${value}` : `${label} : ${value}`;
}

interface ArabicCountForms {
  readonly one: string;
  readonly two: string;
  /** 3–10 (and 103–110 …): plural noun. */
  readonly few: string;
  /** 0, 11–99, 100 …: singular noun. */
  readonly many: string;
}

function arabicCount(value: number, forms: ArabicCountForms): string {
  const shown = formatNumber(value, "ar");
  switch (new Intl.PluralRules("ar").select(value)) {
    case "one":
      return forms.one;
    case "two":
      return forms.two;
    case "few":
      return `${shown} ${forms.few}`;
    default:
      return `${shown} ${forms.many}`;
  }
}

function countMatches(ctx: RenderContext, count: number): string {
  if (ctx.lang === "ar") {
    return arabicCount(count, {
      one: "مباراة واحدة",
      two: "مباراتان",
      few: "مباريات",
      many: "مباراة",
    });
  }
  return `${formatNumber(count, "fr")} ${Math.abs(count) < 2 ? "match" : "matchs"}`;
}

function countPoints(ctx: RenderContext, points: number): string {
  if (ctx.lang === "ar") {
    return arabicCount(points, { one: "نقطة واحدة", two: "نقطتين", few: "نقاط", many: "نقطة" });
  }
  return `${formatNumber(points, "fr")} ${Math.abs(points) < 2 ? "point" : "points"}`;
}

/** "1 heure" / "30 minutes"; Arabic in the genitive, as it follows "بعد". */
function duration(ctx: RenderContext, minutes: number): string {
  const whole = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 60;
  const inHours = whole % 60 === 0;
  const value = inHours ? whole / 60 : whole;
  if (ctx.lang === "ar") {
    return inHours
      ? arabicCount(value, { one: "ساعة", two: "ساعتين", few: "ساعات", many: "ساعة" })
      : arabicCount(value, { one: "دقيقة", two: "دقيقتين", few: "دقائق", many: "دقيقة" });
  }
  const unit = inHours ? "heure" : "minute";
  return `${value} ${unit}${value > 1 ? "s" : ""}`;
}

function frenchOrdinal(rank: number): string {
  return rank === 1 ? "1er" : `${formatNumber(rank, "fr")}e`;
}

const COPY = {
  botolaPro: { fr: "Botola Pro", ar: "البطولة الاحترافية" },
  fantasy: { fr: "Fantasy", ar: "فانتازي" },
  yourClub: { fr: "Votre club", ar: "فريقك" },
  // The app's own strings: matches.kickoff_unconfirmed, kickoff_date_unconfirmed.
  timeTbc: { fr: "heure à confirmer", ar: "التوقيت غير مؤكد" },
  dateTbc: { fr: "date à confirmer", ar: "التاريخ غير محدد" },
  at: { fr: "à", ar: "على الساعة" },
} as const;

function copy(ctx: RenderContext, key: keyof typeof COPY): string {
  return COPY[key][ctx.lang];
}

type StatusKey = "postponed" | "cancelled" | "interrupted" | "live" | "delayed" | "finished";

const STATUS_LABELS: Record<StatusKey, { readonly fr: string; readonly ar: string }> = {
  postponed: { fr: "reporté", ar: "مؤجلة" },
  cancelled: { fr: "annulé", ar: "ملغاة" },
  interrupted: { fr: "interrompu", ar: "متوقفة" },
  live: { fr: "en direct", ar: "مباشر" },
  delayed: { fr: "retardé", ar: "متأخر" },
  finished: { fr: "terminé", ar: "انتهت" },
};

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

type Center =
  | { readonly kind: "time"; readonly time: string }
  | { readonly kind: "tbc" }
  | { readonly kind: "score"; readonly home: number; readonly away: number }
  | { readonly kind: "status"; readonly status: StatusKey };

interface Kickoff {
  /** Weekday and date, or null when the kickoff instant is unusable. */
  readonly day: string | null;
  readonly dayKey: string | null;
  /** Null when the time is not confirmed. */
  readonly time: string | null;
  readonly sortKey: number;
}

interface FixtureRow {
  readonly fixture: EmailFixture;
  readonly home: string;
  readonly away: string;
  readonly favorite: "home" | "away" | null;
  readonly center: Center;
  readonly kickoff: Kickoff;
  /** Postponed or cancelled: the stored date is not a date anyone can plan on. */
  readonly off: boolean;
}

// A placeholder midnight sorts after every real kickoff on its day.
const TBC_SORT_OFFSET_MS = 86_340_000;

function kickoffOf(fixture: EmailFixture, ctx: RenderContext): Kickoff {
  const instant = parseInstant(fixture.kickoffAt);
  if (!instant) return { day: null, dayKey: null, time: null, sortKey: Number.POSITIVE_INFINITY };
  if (!fixture.timeConfirmed) {
    return {
      day: formatDay(instant, ctx.lang, COMPETITION_TIME_ZONE),
      dayKey: dayKey(instant, COMPETITION_TIME_ZONE),
      time: null,
      sortKey: instant.getTime() + TBC_SORT_OFFSET_MS,
    };
  }
  return {
    day: formatDay(instant, ctx.lang, ctx.timeZone),
    dayKey: dayKey(instant, ctx.timeZone),
    time: formatTime(instant, ctx.lang, ctx.timeZone),
    sortKey: instant.getTime(),
  };
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function centerOf(fixture: EmailFixture, kickoff: Kickoff): Center {
  switch (fixture.status) {
    case "finished":
      return isScore(fixture.homeScore) && isScore(fixture.awayScore)
        ? { kind: "score", home: fixture.homeScore, away: fixture.awayScore }
        : { kind: "status", status: "finished" };
    case "postponed":
      return { kind: "status", status: "postponed" };
    case "cancelled":
      return { kind: "status", status: "cancelled" };
    case "suspended":
    case "abandoned":
      return { kind: "status", status: "interrupted" };
    case "live_first_half":
    case "half_time":
    case "live_second_half":
    case "extra_time":
    case "penalties":
      return { kind: "status", status: "live" };
    case "delayed":
      return { kind: "status", status: "delayed" };
    default:
      return kickoff.time === null ? { kind: "tbc" } : { kind: "time", time: kickoff.time };
  }
}

function teamName(team: EmailTeam, ctx: RenderContext): string {
  return (
    cleanText(team?.name?.[ctx.lang], 80) ||
    cleanText(team?.name?.fr, 80) ||
    cleanText(team?.shortName?.[ctx.lang], 80) ||
    "?"
  );
}

function toRow(fixture: EmailFixture, ctx: RenderContext): FixtureRow {
  const kickoff = kickoffOf(fixture, ctx);
  const fav = ctx.favoriteTeamId;
  return {
    fixture,
    home: teamName(fixture.home, ctx),
    away: teamName(fixture.away, ctx),
    favorite:
      fav && fixture.home?.id === fav ? "home" : fav && fixture.away?.id === fav ? "away" : null,
    center: centerOf(fixture, kickoff),
    kickoff,
    off: fixture.status === "postponed" || fixture.status === "cancelled",
  };
}

/** Kickoff order, the favourite club's match first unless `favoriteFirst` is false. */
function orderedRows(
  fixtures: readonly EmailFixture[],
  ctx: RenderContext,
  favoriteFirst = true,
): FixtureRow[] {
  const rows = (Array.isArray(fixtures) ? fixtures : [])
    .map((fixture, index) => ({ row: toRow(fixture, ctx), index }))
    .sort((a, b) => {
      const ak = a.row.kickoff.sortKey;
      const bk = b.row.kickoff.sortKey;
      if (ak !== bk) return ak < bk ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
  if (!favoriteFirst) return rows;
  return [...rows.filter((row) => row.favorite), ...rows.filter((row) => !row.favorite)];
}

function statusLabel(ctx: RenderContext, status: StatusKey): string {
  return STATUS_LABELS[status][ctx.lang];
}

/** "Raja Casablanca 2 – 1 Wydad Casablanca" or "A – B · 21:00" / "· reporté". */
function rowText(row: FixtureRow, ctx: RenderContext): string {
  const c = row.center;
  switch (c.kind) {
    case "score":
      return `${row.home} ${c.home} – ${c.away} ${row.away}`;
    case "time":
      return `${row.home} – ${row.away} · ${c.time}`;
    case "tbc":
      return `${row.home} – ${row.away} · ${copy(ctx, "timeTbc")}`;
    case "status":
      return `${row.home} – ${row.away} · ${statusLabel(ctx, c.status)}`;
  }
}

/** "samedi 26 septembre à 21:00" / "…, heure à confirmer". */
function whenRuns(kickoff: Kickoff, ctx: RenderContext): Run[] {
  const day = kickoff.day ?? copy(ctx, "dateTbc");
  if (kickoff.time === null) return [plain(`${day}${t(ctx, ", ", "، ")}${copy(ctx, "timeTbc")}`)];
  return [plain(`${day} ${copy(ctx, "at")} `), iso(kickoff.time)];
}

/* ------------------------------------------------------------------ */
/* Content model                                                       */
/* ------------------------------------------------------------------ */

/** A run of inline text. `ltr` keeps a number or time intact inside Arabic. */
interface Run {
  readonly text: string;
  readonly ltr?: boolean;
  readonly strong?: boolean;
}

const plain = (text: string): Run => ({ text });
const iso = (text: string): Run => ({ text, ltr: true });
const strong = (text: string): Run => ({ text, strong: true });

type Block =
  | { readonly kind: "paragraph"; readonly runs: readonly Run[] }
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "fixtures"; readonly rows: readonly FixtureRow[] }
  | {
      readonly kind: "facts";
      readonly items: readonly { readonly label: string; readonly value: readonly Run[] }[];
    }
  | { readonly kind: "stat"; readonly value: string; readonly label: string }
  | { readonly kind: "callout"; readonly label: string; readonly runs: readonly Run[] };

interface EmailContent {
  readonly subject: string;
  readonly preheader: string;
  /** Small line above the title: "Botola Pro" or "Fantasy". */
  readonly kicker: string;
  readonly title: string;
  readonly dateline: string | null;
  readonly blocks: readonly Block[];
  readonly cta: { readonly label: string; readonly url: string };
}

type Links = ReturnType<typeof linksFor>;

/* ------------------------------------------------------------------ */
/* The six emails                                                      */
/* ------------------------------------------------------------------ */

function isPlayable(row: FixtureRow): boolean {
  return row.center.kind === "time" || row.center.kind === "tbc";
}

function matchdayPreview(
  payload: MatchdayPreviewPayload,
  ctx: RenderContext,
  links: Links,
): EmailContent {
  const rows = orderedRows(payload.fixtures, ctx);
  const count = rows.length;
  const date = formatCalendarDate(payload.date, ctx.lang) ?? rows[0]?.kickoff.day ?? null;
  const fav = rows.find((row) => row.favorite && isPlayable(row));
  const counted = countMatches(ctx, count);

  let subject: string;
  let preheader: string;
  if (fav) {
    const at =
      fav.kickoff.time === null
        ? `(${copy(ctx, "timeTbc")})`
        : `${copy(ctx, "at")} ${fav.kickoff.time}`;
    subject = t(
      ctx,
      `Aujourd'hui : ${fav.home} – ${fav.away} ${at}`,
      `اليوم: ${fav.home} – ${fav.away} ${at}`,
    );
    preheader =
      fav.kickoff.time === null
        ? t(ctx, `${counted} au programme aujourd'hui`, `${counted} في برنامج اليوم`)
        : t(
            ctx,
            `Votre club joue à ${fav.kickoff.time} · ${counted} au programme aujourd'hui`,
            `فريقك يلعب على الساعة ${fav.kickoff.time} · ${counted} في برنامج اليوم`,
          );
  } else {
    subject = t(
      ctx,
      `Aujourd'hui en Botola Pro : ${counted}`,
      `اليوم في البطولة الاحترافية: ${counted}`,
    );
    preheader = t(ctx, `${counted} au programme aujourd'hui`, `${counted} في برنامج اليوم`);
  }
  if (date) preheader += ` · ${date}`;

  return {
    subject,
    preheader,
    kicker: copy(ctx, "botolaPro"),
    title: t(ctx, "Aujourd'hui en Botola Pro", "اليوم في البطولة الاحترافية"),
    dateline: date ? capitalize(date, ctx.lang) : null,
    blocks: [
      {
        kind: "paragraph",
        runs: [
          plain(
            t(
              ctx,
              `${capitalize(counted, ctx.lang)} au programme aujourd'hui. Voici les horaires des coups d'envoi.`,
              `${counted} في برنامج اليوم. إليك مواعيد انطلاق المباريات.`,
            ),
          ),
        ],
      },
      { kind: "fixtures", rows },
    ],
    cta: { label: t(ctx, "Voir les matchs", "عرض المباريات"), url: links.matches },
  };
}

function matchdayResults(
  payload: MatchdayResultsPayload,
  ctx: RenderContext,
  links: Links,
): EmailContent {
  const rows = orderedRows(payload.fixtures, ctx);
  const date = formatCalendarDate(payload.date, ctx.lang) ?? rows[0]?.kickoff.day ?? null;
  const fav = rows.find((row) => row.favorite && row.center.kind === "score");

  const subject = fav
    ? t(
        ctx,
        `${rowText(fav, ctx)} : tous les résultats du jour`,
        `${rowText(fav, ctx)}: كل نتائج اليوم`,
      )
    : t(ctx, "Résultats du jour en Botola Pro", "نتائج اليوم في البطولة الاحترافية");
  const preheader =
    rows.length > 0
      ? rows
          .slice(0, 3)
          .map((row) => rowText(row, ctx))
          .join(" · ")
      : t(ctx, "Les résultats du jour en Botola Pro", "نتائج اليوم في البطولة الاحترافية");

  const intro = date
    ? t(
        ctx,
        `Tous les scores finaux de la Botola Pro pour ce ${date}.`,
        `إليك النتائج النهائية لمباريات البطولة الاحترافية ليوم ${date}.`,
      )
    : t(
        ctx,
        "Tous les scores finaux de la Botola Pro aujourd'hui.",
        "إليك النتائج النهائية لمباريات البطولة الاحترافية اليوم.",
      );

  return {
    subject,
    preheader,
    kicker: copy(ctx, "botolaPro"),
    title: t(ctx, "Résultats du jour", "نتائج اليوم"),
    dateline: date ? capitalize(date, ctx.lang) : null,
    blocks: [
      { kind: "paragraph", runs: [plain(intro)] },
      { kind: "fixtures", rows },
    ],
    cta: { label: t(ctx, "Voir les résultats", "عرض النتائج"), url: links.matches },
  };
}

function roundPreview(
  payload: RoundPreviewPayload,
  ctx: RenderContext,
  links: Links,
): EmailContent {
  const round = payload.round;
  const roundLabel =
    typeof round?.number === "number" && Number.isFinite(round.number)
      ? t(ctx, `Journée ${round.number}`, `الجولة ${round.number}`)
      : cleanText(round?.name, 80) || t(ctx, "Prochaine journée", "الجولة القادمة");
  // The favourite's match leads the email as a callout; inside the day groups
  // it keeps its chronological place (highlighted), so each day reads in order.
  const rows = orderedRows(payload.fixtures, ctx, false);

  // Day groups in calendar order; postponed/cancelled matches last, without a date.
  const groups = new Map<string, { title: string; rows: FixtureRow[] }>();
  const OFF = "~2-off";
  const UNDATED = "~1-undated";
  for (const row of rows) {
    const key = row.off ? OFF : (row.kickoff.dayKey ?? UNDATED);
    const title =
      key === OFF
        ? t(ctx, "Matchs reportés ou annulés", "مباريات مؤجلة أو ملغاة")
        : key === UNDATED
          ? capitalize(copy(ctx, "dateTbc"), ctx.lang)
          : capitalize(row.kickoff.day ?? "", ctx.lang);
    const group = groups.get(key) ?? { title, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const scheduled = rows
    .filter((row) => !row.off && row.kickoff.day !== null)
    .sort((a, b) => a.kickoff.sortKey - b.kickoff.sortKey);
  const first = scheduled[0];
  const fav = rows.find((row) => row.favorite && !row.off && isPlayable(row));

  const blocks: Block[] = [];
  if (first) {
    blocks.push({
      kind: "paragraph",
      runs: [
        plain(t(ctx, "Premier coup d'envoi : ", "أول انطلاقة: ")),
        ...whenRuns(first.kickoff, ctx),
        plain(
          t(
            ctx,
            ". Voici le programme complet, jour par jour.",
            ". إليك البرنامج الكامل يومًا بيوم.",
          ),
        ),
      ],
    });
  }
  if (fav) {
    blocks.push({
      kind: "callout",
      label: copy(ctx, "yourClub"),
      runs: [
        strong(`${fav.home} – ${fav.away}`),
        plain(t(ctx, ", ", "، ")),
        ...whenRuns(fav.kickoff, ctx),
      ],
    });
  }
  for (const [, group] of orderedGroups) {
    blocks.push({ kind: "heading", text: group.title });
    blocks.push({ kind: "fixtures", rows: group.rows });
  }

  let preheader: string;
  if (fav) {
    const lead = fav.kickoff.day
      ? t(ctx, "Votre club joue ", "يلعب فريقك يوم ")
      : t(ctx, "Votre club : ", "فريقك: ");
    preheader = lead + runsText(whenRuns(fav.kickoff, ctx));
  } else if (first) {
    preheader =
      t(
        ctx,
        `${countMatches(ctx, rows.length)} au programme · premier coup d'envoi `,
        `${countMatches(ctx, rows.length)} في البرنامج · أول انطلاقة `,
      ) + runsText(whenRuns(first.kickoff, ctx));
  } else {
    preheader = t(ctx, "Le programme complet, jour par jour", "البرنامج الكامل يومًا بيوم");
  }

  return {
    subject: t(
      ctx,
      `${roundLabel} de Botola Pro : le programme`,
      `${roundLabel} من البطولة الاحترافية: البرنامج`,
    ),
    preheader,
    kicker: copy(ctx, "botolaPro"),
    title: t(ctx, `${roundLabel} : le programme`, `${roundLabel}: البرنامج`),
    dateline: null,
    blocks,
    cta: { label: t(ctx, "Voir les matchs", "عرض المباريات"), url: links.matches },
  };
}

function matchStarting(
  payload: MatchStartingPayload,
  ctx: RenderContext,
  links: Links,
): EmailContent {
  const row = toRow(payload.fixture, ctx);
  const inTime = duration(ctx, payload.minutes);
  const kickoffRuns: Run[] =
    row.kickoff.time === null
      ? [plain(t(ctx, "Coup d'envoi : ", "موعد المباراة: ")), ...whenRuns(row.kickoff, ctx)]
      : [
          plain(t(ctx, "Coup d'envoi à ", "انطلاق المباراة على الساعة ")),
          iso(row.kickoff.time),
          plain(row.kickoff.day ? ` (${row.kickoff.day})` : ""),
        ];

  return {
    subject: t(
      ctx,
      `${row.home} – ${row.away} commence dans ${inTime}`,
      `تنطلق مباراة ${row.home} – ${row.away} بعد ${inTime}`,
    ),
    preheader:
      runsText(kickoffRuns) +
      t(ctx, ". Suivez le match en direct sur BotolaGO.", ". تابعها مباشرة على BotolaGO."),
    kicker: copy(ctx, "botolaPro"),
    title: t(ctx, `Coup d'envoi dans ${inTime}`, `انطلاق المباراة بعد ${inTime}`),
    dateline: null,
    blocks: [
      { kind: "fixtures", rows: [row] },
      {
        kind: "paragraph",
        runs: [
          ...kickoffRuns,
          plain(
            t(
              ctx,
              ". Suivez le match en direct sur BotolaGO : score, buts et compositions.",
              ". تابع المباراة مباشرة على BotolaGO: النتيجة والأهداف والتشكيلات.",
            ),
          ),
        ],
      },
    ],
    cta: {
      label: t(ctx, "Suivre le match", "تابع المباراة"),
      url: links.match(String(payload.fixture?.id ?? "")),
    },
  };
}

function deadline24h(payload: DeadlinePayload, ctx: RenderContext, links: Links): EmailContent {
  const deadline = parseInstant(payload.deadlineAt);
  if (!deadline) throw new Error("notification email: deadline_24h has no valid deadlineAt");
  const sequence = formatNumber(payload.gameweek?.sequence, ctx.lang);
  const day = formatDay(deadline, ctx.lang, ctx.timeZone);
  const time = formatTime(deadline, ctx.lang, ctx.timeZone);
  const when: Run[] = [plain(`${day} ${copy(ctx, "at")} `), iso(time)];
  const gameweek = t(ctx, `Journée ${sequence}`, `الجولة ${sequence}`);

  return {
    subject: t(
      ctx,
      "Plus que 24 h pour valider votre équipe Fantasy",
      "بقيت 24 ساعة فقط لتأكيد فريقك في فانتازي",
    ),
    preheader: `${gameweek} · ${labelled(ctx, t(ctx, "date limite", "الموعد النهائي"), runsText(when))}`,
    kicker: copy(ctx, "fantasy"),
    title: t(ctx, "Plus que 24 h avant la date limite", "بقيت 24 ساعة على الموعد النهائي"),
    dateline: null,
    blocks: [
      {
        kind: "paragraph",
        runs: [
          plain(
            t(
              ctx,
              "La date limite approche. Faites vos transferts et choisissez votre capitaine avant l'heure indiquée : ensuite, les changements sont verrouillés.",
              "الموعد النهائي يقترب. أجرِ انتقالاتك واختر قائدك قبل الموعد المحدد، فبعده تُقفل التعديلات.",
            ),
          ),
        ],
      },
      {
        kind: "facts",
        items: [
          { label: t(ctx, "Journée", "الجولة"), value: [iso(sequence)] },
          { label: t(ctx, "Date limite", "الموعد النهائي"), value: when },
        ],
      },
    ],
    cta: { label: t(ctx, "Gérer mon équipe", "إدارة فريقي"), url: links.fantasyTransfers },
  };
}

function gameweekFinalized(
  payload: GameweekFinalizedPayload,
  ctx: RenderContext,
  links: Links,
): EmailContent {
  const sequence = formatNumber(payload.gameweek, ctx.lang);
  const points = isScore(payload.points) ? payload.points : 0;
  const counted = countPoints(ctx, points);
  const gameweek = t(ctx, `Journée ${sequence}`, `الجولة ${sequence}`);

  const facts: { label: string; value: Run[] }[] = [];
  if (isScore(payload.totalPoints)) {
    facts.push({
      label: t(ctx, "Points totaux", "مجموع النقاط"),
      value: [iso(formatNumber(payload.totalPoints, ctx.lang))],
    });
  }
  if (isScore(payload.overallRank)) {
    facts.push({
      label: t(ctx, "Classement général", "الترتيب العام"),
      value: [
        iso(
          ctx.lang === "ar"
            ? formatNumber(payload.overallRank, "ar")
            : frenchOrdinal(payload.overallRank),
        ),
      ],
    });
  }

  const blocks: Block[] = [
    {
      kind: "paragraph",
      runs: [
        plain(
          t(
            ctx,
            `Vous avez marqué ${counted} lors de cette journée.`,
            `جمعت ${counted} في هذه الجولة.`,
          ),
        ),
      ],
    },
    {
      kind: "stat",
      value: formatNumber(points, ctx.lang),
      label: t(ctx, "Points de la journée", "نقاط الجولة"),
    },
  ];
  if (facts.length > 0) blocks.push({ kind: "facts", items: facts });

  const summary = facts.map((fact) => labelled(ctx, fact.label, runsText(fact.value)));
  return {
    subject: t(ctx, `${gameweek} : vous avez marqué ${counted}`, `${gameweek}: جمعت ${counted}`),
    preheader:
      summary.length > 0
        ? summary.join(" · ")
        : t(
            ctx,
            "Découvrez le détail de vos points sur BotolaGO",
            "اكتشف تفاصيل نقاطك على BotolaGO",
          ),
    kicker: copy(ctx, "fantasy"),
    title: t(ctx, `${gameweek} : vos points sont définitifs`, `${gameweek}: نقاطك نهائية`),
    dateline: null,
    blocks,
    cta: { label: t(ctx, "Voir mes points", "عرض نقاطي"), url: links.fantasyPoints },
  };
}

function buildContent(
  delivery: ClaimedEmailDelivery,
  ctx: RenderContext,
  links: Links,
): EmailContent {
  switch (delivery.type) {
    case "matchday_preview":
      return matchdayPreview(delivery.payload, ctx, links);
    case "matchday_results":
      return matchdayResults(delivery.payload, ctx, links);
    case "round_preview":
      return roundPreview(delivery.payload, ctx, links);
    case "match_starting":
      return matchStarting(delivery.payload, ctx, links);
    case "deadline_24h":
      return deadline24h(delivery.payload, ctx, links);
    case "gameweek_finalized":
      return gameweekFinalized(delivery.payload, ctx, links);
    default: {
      const unknown: never = delivery;
      throw new Error(
        `notification email: unknown type ${String((unknown as { type?: unknown }).type)}`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Plain text                                                          */
/* ------------------------------------------------------------------ */

function runsText(runs: readonly Run[]): string {
  return runs.map((run) => run.text).join("");
}

interface Chrome {
  readonly greeting: string;
  readonly why: string;
  readonly manage: { readonly label: string; readonly url: string };
  readonly unsubscribe: { readonly label: string; readonly url: string };
}

const BRAND_LINE = "BotolaGO · botolago.com";

function renderText(content: EmailContent, chrome: Chrome, ctx: RenderContext): string {
  const out: string[] = [`BotolaGO · ${content.kicker}`, "", content.title];
  if (content.dateline) out.push(content.dateline);
  out.push("", chrome.greeting, "");
  for (const block of content.blocks) {
    switch (block.kind) {
      case "paragraph":
        out.push(runsText(block.runs), "");
        break;
      case "heading":
        out.push(block.text);
        break;
      case "fixtures":
        for (const row of block.rows) {
          out.push(`- ${rowText(row, ctx)}${row.favorite ? ` (${copy(ctx, "yourClub")})` : ""}`);
        }
        out.push("");
        break;
      case "facts":
        for (const item of block.items) out.push(labelled(ctx, item.label, runsText(item.value)));
        out.push("");
        break;
      case "stat":
        out.push(labelled(ctx, block.label, block.value), "");
        break;
      case "callout":
        out.push(labelled(ctx, block.label, runsText(block.runs)), "");
        break;
    }
  }
  out.push(labelled(ctx, content.cta.label, content.cta.url), "", "--", chrome.why);
  out.push(labelled(ctx, chrome.manage.label, chrome.manage.url));
  out.push(labelled(ctx, chrome.unsubscribe.label, chrome.unsubscribe.url));
  out.push(BRAND_LINE);
  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

/* ------------------------------------------------------------------ */
/* HTML                                                                */
/* ------------------------------------------------------------------ */

function runsHtml(runs: readonly Run[], ctx: RenderContext): string {
  return runs
    .map((run) => {
      let html = escapeHtml(run.text);
      if (run.ltr && ctx.dir === "rtl") html = `<span dir="ltr">${html}</span>`;
      if (run.strong) html = `<strong style="font-weight:700;">${html}</strong>`;
      return html;
    })
    .join("");
}

/** A number or time that must keep its own direction inside Arabic text. */
function isoHtml(text: string, ctx: RenderContext): string {
  return runsHtml([iso(text)], ctx);
}

function tableOpen(ctx: RenderContext, style: string, extra = ""): string {
  return `<table role="presentation" dir="${ctx.dir}" width="100%" cellpadding="0" cellspacing="0" border="0"${extra} style="width:100%;${style}">`;
}

function cellFont(ctx: RenderContext): string {
  return `font-family:${ctx.font};`;
}

function badgeHtml(label: string, ctx: RenderContext): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background-color:${C.ink};color:#ffffff;${cellFont(ctx)}font-size:12px;line-height:16px;font-weight:700;">${escapeHtml(label)}</span>`;
}

function centerHtml(row: FixtureRow, ctx: RenderContext): string {
  const c = row.center;
  const small = `font-size:12px;line-height:1.3;font-weight:700;color:${C.muted};`;
  switch (c.kind) {
    case "score":
      // Each score is isolated on its own and the dash stays in the line's
      // direction, so in Arabic the home score still sits beside the home
      // club (on the right). One LTR span around "2 – 1" would put it by the
      // away club instead.
      return `<span style="font-size:18px;line-height:1.2;font-weight:800;color:${C.ink};white-space:nowrap;">${isoHtml(String(c.home), ctx)} – ${isoHtml(String(c.away), ctx)}</span>`;
    case "time":
      return `<span style="font-size:16px;line-height:1.2;font-weight:700;color:${C.ink};white-space:nowrap;">${isoHtml(c.time, ctx)}</span>`;
    case "tbc":
      return `<span style="${small}">${escapeHtml(capitalize(copy(ctx, "timeTbc"), ctx.lang))}</span>`;
    case "status":
      return `<span style="${small}">${escapeHtml(capitalize(statusLabel(ctx, c.status), ctx.lang))}</span>`;
  }
}

function fixtureRowHtml(row: FixtureRow, ctx: RenderContext): string {
  const bg = row.favorite ? C.favoriteTint : C.surface;
  const border = row.favorite ? C.accent : C.rule;
  const name = (text: string, isFav: boolean, align: "left" | "right", inner: "left" | "right") =>
    `<td width="50%" align="${align}" style="padding:12px 0;padding-${inner}:8px;padding-${inner === "left" ? "right" : "left"}:12px;text-align:${align};${cellFont(ctx)}font-size:15px;line-height:1.35;color:${C.text};font-weight:${isFav ? 700 : 400};">${escapeHtml(text)}</td>`;
  // Home hugs the centre from the start side, away from the end side.
  const home = name(row.home, row.favorite === "home", ctx.end, ctx.end);
  const away = name(row.away, row.favorite === "away", ctx.start, ctx.start);
  const badge = row.favorite
    ? `<tr><td colspan="3" align="${ctx.start}" style="padding:10px 12px 0;text-align:${ctx.start};${cellFont(ctx)}">${badgeHtml(copy(ctx, "yourClub"), ctx)}</td></tr>`
    : "";
  return [
    tableOpen(
      ctx,
      `border-collapse:separate;border-spacing:0;background-color:${bg};border:1px solid ${border};border-radius:10px;`,
    ),
    badge,
    "<tr>",
    home,
    `<td width="76" align="center" style="width:76px;padding:12px 4px;text-align:center;${cellFont(ctx)}">${centerHtml(row, ctx)}</td>`,
    away,
    "</tr>",
    "</table>",
  ].join("");
}

function blockHtml(block: Block, ctx: RenderContext): string {
  switch (block.kind) {
    case "paragraph":
      return `<p style="margin:16px 0 0;">${runsHtml(block.runs, ctx)}</p>`;
    case "heading":
      return `<h2 style="margin:24px 0 0;${cellFont(ctx)}font-size:15px;line-height:1.4;font-weight:700;color:${C.ink};">${escapeHtml(block.text)}</h2>`;
    case "fixtures":
      return [
        tableOpen(ctx, "margin:12px 0 0;"),
        ...block.rows.map(
          (row) => `<tr><td style="padding:0 0 8px;">${fixtureRowHtml(row, ctx)}</td></tr>`,
        ),
        "</table>",
      ].join("");
    case "facts":
      return [
        tableOpen(
          ctx,
          `margin:16px 0 0;border-collapse:separate;border-spacing:0;background-color:${C.page};border-radius:10px;`,
        ),
        ...block.items.map((item, index) => {
          const rule = index > 0 ? `border-top:1px solid ${C.rule};` : "";
          return `<tr><td align="${ctx.start}" style="padding:12px 16px;${rule}text-align:${ctx.start};${cellFont(ctx)}font-size:14px;line-height:1.4;color:${C.muted};">${escapeHtml(item.label)}</td><td align="${ctx.end}" style="padding:12px 16px;${rule}text-align:${ctx.end};${cellFont(ctx)}font-size:16px;line-height:1.4;font-weight:700;color:${C.ink};">${runsHtml(item.value, ctx)}</td></tr>`;
        }),
        "</table>",
      ].join("");
    case "stat":
      return [
        tableOpen(ctx, "margin:20px 0 0;"),
        `<tr><td align="center" bgcolor="${C.ink}" style="padding:20px 16px;background-color:${C.ink};border-radius:12px;text-align:center;${cellFont(ctx)}">`,
        `<div style="font-size:44px;line-height:1.1;font-weight:800;color:#ffffff;">${isoHtml(block.value, ctx)}</div>`,
        `<div style="margin-top:6px;font-size:14px;line-height:1.4;font-weight:700;color:${C.onInk};">${escapeHtml(block.label)}</div>`,
        "</td></tr></table>",
      ].join("");
    case "callout":
      return [
        tableOpen(ctx, "margin:16px 0 0;border-collapse:separate;border-spacing:0;"),
        `<tr><td align="${ctx.start}" bgcolor="${C.favoriteTint}" style="padding:14px 16px;background-color:${C.favoriteTint};border:1px solid ${C.accent};border-radius:10px;text-align:${ctx.start};${cellFont(ctx)}font-size:15px;line-height:${ctx.lineHeight};color:${C.text};">`,
        badgeHtml(block.label, ctx),
        `<div style="margin-top:8px;">${runsHtml(block.runs, ctx)}</div>`,
        "</td></tr></table>",
      ].join("");
  }
}

function ctaHtml(cta: EmailContent["cta"], ctx: RenderContext): string {
  return [
    `<table role="presentation" dir="${ctx.dir}" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0;">`,
    `<tr><td align="center" bgcolor="${C.ink}" style="border-radius:10px;background-color:${C.ink};">`,
    `<a href="${escapeHtml(cta.url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;${cellFont(ctx)}font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a>`,
    "</td></tr></table>",
  ].join("");
}

// Keeps the inbox preview to the preheader instead of the first body text.
const PREHEADER_FILLER = "&#8199;&#65279;&#847; ".repeat(40);

function renderHtml(
  content: EmailContent,
  chrome: Chrome,
  ctx: RenderContext,
  subject: string,
  preheader: string,
): string {
  const linkStyle = `color:${C.ink};text-decoration:underline;`;
  const bodyCell = `background-color:${C.surface};padding:28px 24px 32px;border-radius:0 0 14px 14px;text-align:${ctx.start};${cellFont(ctx)}font-size:16px;line-height:${ctx.lineHeight};color:${C.text};`;
  return [
    "<!DOCTYPE html>",
    `<html lang="${ctx.lang}" dir="${ctx.dir}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(subject)}</title>`,
    // Optional refinements only; the layout does not depend on this block.
    "<style>",
    "@media only screen and (max-width:620px){.bg-outer{padding:12px 8px !important}.bg-card{padding:24px 16px 28px !important}.bg-band{padding:16px !important}}",
    "a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important}",
    "</style>",
    "</head>",
    `<body dir="${ctx.dir}" style="margin:0;padding:0;width:100%;background-color:${C.page};">`,
    `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${escapeHtml(preheader)}${PREHEADER_FILLER}</div>`,
    tableOpen(ctx, `background-color:${C.page};`, ` bgcolor="${C.page}"`),
    `<tr><td class="bg-outer" align="center" style="padding:24px 12px;">`,
    `<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`,
    tableOpen(ctx, "max-width:600px;margin:0 auto;"),
    // Header band: the text wordmark.
    `<tr><td class="bg-band" dir="${ctx.dir}" align="${ctx.start}" bgcolor="${C.ink}" style="background-color:${C.ink};padding:20px 24px;border-radius:14px 14px 0 0;text-align:${ctx.start};">`,
    `<span dir="ltr" style="font-family:${FONT_LATIN};font-size:24px;line-height:28px;font-weight:800;color:#ffffff;">Botola<span style="color:${C.onInk};">GO</span></span>`,
    "</td></tr>",
    // Body card.
    `<tr><td class="bg-card" dir="${ctx.dir}" align="${ctx.start}" style="${bodyCell}">`,
    `<p style="margin:0 0 6px;font-size:13px;line-height:18px;font-weight:700;color:${C.ink};">${escapeHtml(content.kicker)}</p>`,
    `<h1 style="margin:0;${cellFont(ctx)}font-size:24px;line-height:1.3;font-weight:800;color:${C.text};">${escapeHtml(content.title)}</h1>`,
    content.dateline
      ? `<p style="margin:6px 0 0;font-size:15px;line-height:1.4;color:${C.muted};">${escapeHtml(content.dateline)}</p>`
      : "",
    `<p style="margin:20px 0 0;">${escapeHtml(chrome.greeting)}</p>`,
    ...content.blocks.map((block) => blockHtml(block, ctx)),
    ctaHtml(content.cta, ctx),
    "</td></tr>",
    // Footer.
    `<tr><td dir="${ctx.dir}" align="${ctx.start}" style="padding:20px 24px 8px;text-align:${ctx.start};${cellFont(ctx)}font-size:12px;line-height:1.6;color:${C.muted};">`,
    `<p style="margin:0;">${escapeHtml(chrome.why)}</p>`,
    `<p style="margin:8px 0 0;"><a href="${escapeHtml(chrome.manage.url)}" target="_blank" rel="noopener" style="${linkStyle}">${escapeHtml(chrome.manage.label)}</a> · <a href="${escapeHtml(chrome.unsubscribe.url)}" target="_blank" rel="noopener" style="${linkStyle}">${escapeHtml(chrome.unsubscribe.label)}</a></p>`,
    `<p style="margin:8px 0 0;"><span dir="ltr">${escapeHtml(BRAND_LINE)}</span></p>`,
    "</td></tr>",
    "</table>",
    "<!--[if mso]></td></tr></table><![endif]-->",
    "</td></tr></table>",
    "</body>",
    "</html>",
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function renderNotificationEmail(
  delivery: ClaimedEmailDelivery,
  links: EmailLinkContext,
): RenderedEmail {
  const lang: EmailLanguage = delivery.language === "ar" ? "ar" : "fr";
  const rtl = lang === "ar";
  const ctx: RenderContext = {
    lang,
    dir: rtl ? "rtl" : "ltr",
    start: rtl ? "right" : "left",
    end: rtl ? "left" : "right",
    font: rtl ? FONT_ARABIC : FONT_LATIN,
    // The Arabic face needs a taller line box than the Latin one.
    lineHeight: rtl ? "1.7" : "1.5",
    timeZone: resolveTimeZone(delivery.timezone),
    favoriteTeamId:
      typeof delivery.favoriteTeamId === "string" && delivery.favoriteTeamId.length > 0
        ? delivery.favoriteTeamId
        : null,
  };
  const app = appOrigin(links);
  const content = buildContent(delivery, ctx, linksFor(app));

  const name = cleanText(delivery.recipient?.displayName, 60);
  const chrome: Chrome = {
    greeting: name ? t(ctx, `Bonjour ${name},`, `مرحبًا ${name}،`) : t(ctx, "Bonjour,", "مرحبًا،"),
    why: t(
      ctx,
      "Vous recevez cet e-mail car les notifications par e-mail sont activées sur votre compte BotolaGO.",
      "تتلقى هذه الرسالة لأن إشعارات البريد الإلكتروني مفعّلة في حسابك على BotolaGO.",
    ),
    manage: {
      label: t(ctx, "Gérer mes notifications", "إدارة الإشعارات"),
      url: linksFor(app).profile,
    },
    unsubscribe: {
      label: t(ctx, "Se désabonner", "إلغاء الاشتراك"),
      url: unsubscribeUrl(delivery, links),
    },
  };

  const subject = cleanText(content.subject, 250);
  const preheader = cleanText(content.preheader, 250);
  return {
    subject,
    preheader,
    html: renderHtml(content, chrome, ctx, subject, preheader),
    text: renderText(content, chrome, ctx),
  };
}
