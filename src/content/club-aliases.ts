/**
 * The other names Botola Pro clubs go by (SEO brief 3.1). People search a club
 * by its letters ("RSB"), its older or longer name ("Nahdat Berkane") or in
 * Arabic ("نهضة بركان"); the club page carries them in its text and in the
 * `SportsTeam` JSON-LD so those searches can find it.
 *
 * Clubs are matched the way `kits.ts` matches their colours, by a fragment of
 * the name, short name or slug words, never by UUID: `app.clubs.code` is blank
 * for most clubs and the ids differ between environments. The first rule whose
 * fragment is found wins, so a specific fragment goes above one it contains.
 *
 * Only clubs the live club list shows, and only names in common use.
 */

import type { LocalizedString } from "@/types/domain";

export interface ClubAliases {
  /** A stable key for the club; tests and callers use it, the UI never prints it. */
  readonly key: string;
  /** Lowercase, accent-free fragments of the club's name, short name or slug words. */
  readonly match: readonly string[];
  /** Latin-script names and letters, most searched first. */
  readonly latin: readonly string[];
  /** The club's usual Arabic name. */
  readonly arabic: string;
}

export const CLUB_ALIASES: readonly ClubAliases[] = [
  {
    key: "rsb",
    match: ["berkane"],
    latin: ["RSB", "RS Berkane", "Nahdat Berkane"],
    arabic: "نهضة بركان",
  },
  {
    key: "asfar",
    match: ["far rabat", "asfar"],
    latin: ["AS FAR", "FAR Rabat", "Asfar"],
    arabic: "الجيش الملكي",
  },
  {
    key: "wac",
    match: ["wydad", "wca"],
    latin: ["WAC", "Wydad", "Wydad Athletic Club"],
    arabic: "الوداد",
  },
  {
    key: "rca",
    match: ["raja"],
    latin: ["Raja", "RCA", "Raja Club Athletic"],
    arabic: "الرجاء",
  },
  {
    key: "uts",
    match: ["uts", "touarga"],
    latin: ["UTS", "Union Touarga"],
    arabic: "اتحاد تواركة",
  },
  {
    key: "husa",
    match: ["hassania"],
    latin: ["HUSA", "Hassania Agadir"],
    arabic: "حسنية أكادير",
  },
  {
    key: "codm",
    match: ["codm", "meknes"],
    latin: ["CODM", "COD Meknès"],
    arabic: "النادي المكناسي",
  },
  {
    key: "kacm",
    match: ["kawkab"],
    latin: ["KACM", "Kawkab Marrakech"],
    arabic: "الكوكب المراكشي",
  },
  {
    key: "mat",
    match: ["tetouan", "moghreb"],
    latin: ["MAT", "Moghreb Tétouan"],
    arabic: "المغرب التطواني",
  },
  {
    key: "dhj",
    match: ["difa"],
    latin: ["DHJ", "Difaâ El Jadida", "Difaa Hassani El Jadidi"],
    arabic: "الدفاع الحسني الجديدي",
  },
  {
    key: "fus",
    match: ["fus"],
    latin: ["FUS Rabat", "Fath Union Sport"],
    arabic: "الفتح الرياضي",
  },
  {
    key: "rcaz",
    match: ["zemamra"],
    latin: ["RCAZ", "Zemamra"],
    arabic: "نهضة الزمامرة",
  },
  {
    key: "wst",
    match: ["temara", "widad"],
    latin: ["WST", "Widad Témara"],
    arabic: "وداد تمارة",
  },
  {
    key: "irt",
    match: ["tanger"],
    latin: ["IRT", "Ittihad Tanger"],
    arabic: "اتحاد طنجة",
  },
  {
    key: "usat",
    match: ["tiznit"],
    latin: ["USAT", "Amal Tiznit"],
    arabic: "أمل تيزنيت",
  },
  {
    key: "mas",
    match: ["maghreb"],
    latin: ["MAS", "Maghreb Fès"],
    arabic: "المغرب الفاسي",
  },
];

/** What a club is looked up by. `Club` satisfies it. */
export interface AliasLookup {
  slug?: string | null;
  name?: string | LocalizedString | null;
  shortName?: string | LocalizedString | null;
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();

const text = (value: string | LocalizedString | null | undefined) =>
  typeof value === "string" ? value : value ? `${value.fr} ${value.ar}` : "";

/**
 * The slug as words, without the id it ends with:
 * "far-rabat-fd6ff8ea898c" -> "far rabat". Latin in every language, so it
 * finds the club on an Arabic page too.
 */
const slugWords = (slug: string | null | undefined) =>
  (slug ?? "").replace(/-[0-9a-f]{6,}$/i, "").replace(/-/g, " ");

/** The aliases of a club, or undefined for a club the table does not know. */
export function findClubAliases(club: AliasLookup): ClubAliases | undefined {
  const haystack = fold(`${text(club.name)} ${text(club.shortName)} ${slugWords(club.slug)}`);
  // The Arabic name too: with no slug, an Arabic page has nothing Latin to match.
  return CLUB_ALIASES.find(
    (entry) =>
      entry.match.some((fragment) => haystack.includes(fragment)) ||
      haystack.includes(fold(entry.arabic)),
  );
}

/**
 * The names to print for a club, without the ones the page already shows
 * (`shown`, e.g. its name). Latin names first, then the Arabic one.
 */
export function clubAliasNames(
  club: AliasLookup,
  shown: readonly string[] = [],
): { latin: string[]; arabic: string | null } {
  const entry = findClubAliases(club);
  if (!entry) return { latin: [], arabic: null };
  const seen = new Set(shown.map((name) => fold(name.trim())));
  const latin = entry.latin.filter((name) => !seen.has(fold(name)));
  return { latin, arabic: seen.has(fold(entry.arabic)) ? null : entry.arabic };
}
