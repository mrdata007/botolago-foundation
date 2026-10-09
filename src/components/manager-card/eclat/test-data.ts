/**
 * Test data for the Éclat renderer: the card words of both languages (plan appendix A.5) and a
 * profile for each case the renderer draws. Used by the tests in this folder only; nothing in the
 * app imports it.
 */
import type { CardClub, CardProfile, CardStrings } from "../types";

const counted = (lang: "fr" | "ar") => (k: number, n: number) =>
  lang === "fr"
    ? k === 0
      ? `aucune journée comptée sur ${n}`
      : `${k} journée${k > 1 ? "s" : ""} comptée${k > 1 ? "s" : ""} sur ${n}`
    : k === 0
      ? `لا جولات محتسبة بعد من ${n}`
      : k === 1
        ? `جولة واحدة محتسبة من ${n}`
        : k === 2
          ? `جولتان محتسبتان من ${n}`
          : k < 11
            ? `${k} جولات محتسبة من ${n}`
            : `${k} جولة محتسبة من ${n}`;

export const FR: CardStrings = {
  lang: "fr",
  ovr: "OVR",
  stats: { cap: "CAP", sel: "SEL", trf: "TRF", con: "CON" },
  statsLong: {
    cap: "Vos capitaines",
    sel: "Votre onze de départ",
    trf: "Vos transferts",
    con: "Votre régularité",
  },
  tiers: {
    homa: "LASTREET",
    stade: "STADE",
    pro: "PRO",
    champion: "CHAMPION",
    legend: "LEGEND",
  },
  founderLine: "Fondateur 2026",
  sample: "Exemple",
  serial: (s) => `BOT #${s}`,
  a11y: {
    cardOf: "Carte de manager",
    noRating: "pas encore de note",
    counted: counted("fr"),
    separator: ", ",
  },
};

export const AR: CardStrings = {
  lang: "ar",
  ovr: "OVR",
  stats: { cap: "القائد", sel: "التشكيلة", trf: "الانتقالات", con: "الثبات" },
  statsLong: {
    cap: "قرارات القائد",
    sel: "اختيار التشكيلة",
    trf: "قرارات الانتقالات",
    con: "الثبات",
  },
  tiers: {
    homa: "LASTREET",
    stade: "ملعب",
    pro: "محترف",
    champion: "بطل",
    legend: "أسطورة",
  },
  founderLine: "عضو مؤسس 2026",
  sample: "مثال",
  serial: (s) => `BOT #${s}`,
  a11y: {
    cardOf: "بطاقة المدرّب",
    noRating: "لا تقييم بعد",
    counted: counted("ar"),
    separator: "، ",
  },
};

export const LANGS = [FR, AR] as const;

/** Clubs as the card gets them: two hex colours (the kit table's, for the Botola clubs). */
const club = (
  id: string,
  initials: string,
  fr: string,
  ar: string,
  primary: string,
  secondary: string | null,
): CardClub => ({ id, initials, name: { fr, ar }, primary, secondary });

export const CLUBS = {
  raja: club("rca", "RCA", "Raja Casablanca", "الرجاء", "#0a8f3a", "#ffffff"),
  wydad: club("war", "WAC", "Wydad Casablanca", "الوداد", "#c8102e", "#ffffff"),
  far: club("asfar", "FAR", "AS FAR", "الجيش الملكي", "#111111", "#c8102e"),
  fus: club("fus", "FUS", "FUS Rabat", "الفتح", "#f28e00", "#111111"),
  rsb: club("rsb", "RSB", "RS Berkane", "نهضة بركان", "#e63946", "#ffffff"),
  mat: club("mat", "MAT", "Maghreb de Tétouan", "المغرب التطواني", "#c00000", "#ffffff"),
  hus: club("hus", "HUSA", "Hassania d'Agadir", "حسنية أكادير", "#e63900", "#111111"),
  moas: club("moas", "MAS", "Moghreb Athletic", "المغرب الفاسي", "#1e88e5", "#ffffff"),
} as const;

const STATS = { cap: 91, sel: 82, trf: 86, con: 78 };
const NO_STATS = { cap: null, sel: null, trf: null, con: null };

const base: CardProfile = {
  name: "KARIM",
  ovr: 84,
  tier: "pro",
  provisional: true,
  counted: 7,
  minRated: 3,
  season: "2026/27",
  serial: "482913",
  founder: null,
  club: CLUBS.raja,
  stats: STATS,
  sample: true,
};

/** A profile for each case the renderer draws. Names are labelled samples. */
export const PROFILES = {
  rated: base,
  ratedWydad: { ...base, club: CLUBS.wydad },
  ratedFar: { ...base, club: CLUBS.far },
  ratedFus: { ...base, club: CLUBS.fus },
  ratedNoSerial: { ...base, serial: null },
  clubNull: { ...base, club: null },
  founder: { ...base, founder: 2026 },
  homa: { ...base, ovr: 61, tier: "homa", provisional: false, stats: STATS },
  stade: { ...base, ovr: 77, tier: "stade", provisional: false },
  champion: { ...base, ovr: 88, tier: "champion", provisional: false },
  legend: { ...base, ovr: 93, tier: "legend", provisional: false },
  legendFounder: { ...base, ovr: 93, tier: "legend", provisional: false, founder: 2026 },
  /** Saved, 0 of 3: the base card, a dash, three empty marks. */
  born0: {
    ...base,
    ovr: null,
    tier: null,
    counted: 0,
    serial: null,
    provisional: false,
    stats: NO_STATS,
  },
  born0Serial: {
    ...base,
    ovr: null,
    tier: null,
    counted: 0,
    provisional: false,
    stats: NO_STATS,
  },
  forming1: { ...base, ovr: null, tier: null, counted: 1, provisional: false, stats: NO_STATS },
  forming2: { ...base, ovr: null, tier: null, counted: 2, provisional: false, stats: NO_STATS },
  /** 3 of 3, the number not computed yet. */
  insufficient3: {
    ...base,
    ovr: null,
    tier: null,
    counted: 3,
    provisional: false,
    stats: { cap: 91, sel: 82, trf: null, con: null },
  },
  /** The first rating: 3 counted, the number just reached. */
  first: { ...base, counted: 3 },
  ratedTrfNull: { ...base, stats: { ...STATS, trf: null } },
  longNameLatin: { ...base, name: "Abdelkarim Benjelloun-Alaoui" },
  longNameLatinFounder: { ...base, name: "Abdelkarim Benjelloun-Alaoui", founder: 2026 },
  hugeName: { ...base, name: "Mohammed Abderrahmane Benjelloun Touimi Alaoui" },
  arabicName: { ...base, name: "فاطمة الزهراء" },
  arabicCharted: { ...base, name: "علي" },
  arabicChartedFounder: { ...base, name: "ياسمين", founder: 2026 },
  /** Guest: nothing at all. */
  guest: {
    name: "",
    ovr: null,
    tier: null,
    provisional: false,
    counted: 0,
    minRated: 3,
    season: "2026/27",
    serial: null,
    founder: null,
    club: null,
    stats: NO_STATS,
  } satisfies CardProfile,
  unnamed: { ...base, name: "", ovr: null, tier: null, counted: 0, stats: NO_STATS },
} as const satisfies Record<string, CardProfile>;

export type ProfileName = keyof typeof PROFILES;

/** Hostile names a user could type (the card also runs `markup-safety.ts`'s). */
export const HOSTILE_NAMES = [
  "<img src=x onerror=alert(1)>",
  '"><script>alert(1)</script>',
  "{{7*7}}",
  "‮evil",
  "javascript:alert(1)",
  "</svg><svg onload=alert(1)>",
  "'; DROP TABLE cards;--",
  "A&B<C>D\"E'F",
] as const;
