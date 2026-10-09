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

/* ------------------------------------------------------------------------------------------------
   The direction mock's own cards (docs/product/manager-card-sorare-style/mock.html), as profiles:
   the gallery and the layout tests draw exactly what the mock draws.
   ------------------------------------------------------------------------------------------------ */

const mockClub = (
  id: string,
  initials: string,
  fr: string,
  ar: string,
  primary: string,
  secondary: string,
): CardClub => club(id, initials, fr, ar, primary, secondary);

export const MOCK_CLUBS = {
  raja: mockClub("rca", "RCA", "Raja CA", "الرجاء الرياضي", "#0a8f3a", "#ffffff"),
  wydad: mockClub("war", "WAC", "Wydad AC", "الوداد الرياضي", "#c8102e", "#ffffff"),
  far: mockClub("asfar", "FAR", "AS FAR", "الجيش الملكي", "#111111", "#c8102e"),
  fus: mockClub("fus", "FUS", "FUS Rabat", "الفتح الرباطي", "#f28e00", "#111111"),
  mas: mockClub("moas", "MAS", "MAS Fès", "المغرب الفاسي", "#f6d10a", "#111111"),
} as const;

const stats = (cap: number | null, sel: number | null, trf: number | null, con: number | null) => ({
  cap,
  sel,
  trf,
  con,
});

const mockProfile = (
  p: Partial<CardProfile> &
    Pick<CardProfile, "name" | "ovr" | "tier" | "serial" | "club" | "stats">,
): CardProfile => ({
  provisional: false,
  counted: null,
  minRated: null,
  season: "2026/27",
  founder: null,
  ...p,
});

export interface MockCard {
  caption: string;
  profile: CardProfile;
  /** The interface language the mock draws this card in. */
  lang: "fr" | "ar";
}

/** The mock's first row: the six steps of the ladder, in French. */
export const MOCK_CARDS: readonly MockCard[] = [
  {
    caption: "Formation 1/3 · base",
    lang: "fr",
    profile: mockProfile({
      name: "Ali",
      ovr: null,
      tier: null,
      counted: 1,
      minRated: 3,
      serial: "482913",
      club: MOCK_CLUBS.raja,
      stats: stats(null, null, null, null),
    }),
  },
  {
    caption: "LASTREET 61 · sans club",
    lang: "fr",
    profile: mockProfile({
      name: "Hamza",
      ovr: 61,
      tier: "homa",
      serial: "118204",
      club: null,
      stats: stats(58, 64, 60, 61),
    }),
  },
  {
    caption: "STADE 79",
    lang: "fr",
    profile: mockProfile({
      name: "Karim Bennani",
      ovr: 79,
      tier: "stade",
      serial: "240117",
      club: MOCK_CLUBS.wydad,
      stats: stats(81, 77, 80, 76),
    }),
  },
  {
    caption: "PRO 84 · Exemple",
    lang: "fr",
    profile: mockProfile({
      name: "Ali",
      ovr: 84,
      tier: "pro",
      serial: "482913",
      club: MOCK_CLUBS.raja,
      stats: stats(91, 82, 86, 78),
      sample: true,
    }),
  },
  {
    caption: "CHAMPION 88 · holographique · nom long",
    lang: "fr",
    profile: mockProfile({
      name: "Abdelkarim Benjelloun-Alaoui",
      ovr: 88,
      tier: "champion",
      serial: "77031",
      club: MOCK_CLUBS.fus,
      stats: stats(90, 87, null, 88),
    }),
  },
  {
    caption: "LEGEND 99 · holographique · Fondateur 2026",
    lang: "fr",
    profile: mockProfile({
      name: "Yasmine Alaoui",
      ovr: 99,
      tier: "legend",
      serial: "5508",
      club: MOCK_CLUBS.far,
      founder: 2026,
      stats: stats(95, 92, 90, 94),
    }),
  },
];

/** The mock's Arabic row. */
export const MOCK_ARABIC: readonly MockCard[] = [
  {
    caption: "بطل 91 · هولوغرافي · اسم عربي",
    lang: "ar",
    profile: mockProfile({
      name: "فاطمة الزهراء",
      ovr: 91,
      tier: "champion",
      serial: "482913",
      club: MOCK_CLUBS.raja,
      stats: stats(91, 82, 86, 78),
    }),
  },
  {
    caption: "LASTREET 61 · واجهة عربية",
    lang: "ar",
    profile: mockProfile({
      name: "Hamza",
      ovr: 61,
      tier: "homa",
      serial: "118204",
      club: MOCK_CLUBS.wydad,
      stats: stats(58, 64, 60, 61),
    }),
  },
  {
    caption: "أسطورة 97 · مؤسس 2026",
    lang: "ar",
    profile: mockProfile({
      name: "سلمى",
      ovr: 97,
      tier: "legend",
      serial: "1203",
      club: MOCK_CLUBS.far,
      founder: 2026,
      stats: stats(97, 95, 96, 98),
    }),
  },
];

/** The mock's long-name row (240 px wide). */
export const MOCK_NAMES: readonly MockCard[] = [
  {
    caption: "Un seul mot de 24 lettres · STADE 8",
    lang: "fr",
    profile: mockProfile({
      name: "Mohammedabdelhakimalaoui",
      ovr: 8,
      tier: "stade",
      serial: "300001",
      club: MOCK_CLUBS.mas,
      stats: stats(8, 9, 7, 8),
    }),
  },
  {
    caption: "Nom arabe long, interface française · PRO 44",
    lang: "fr",
    profile: mockProfile({
      name: "عبد الرحمن بن جلون العلوي",
      ovr: 44,
      tier: "pro",
      serial: "300002",
      club: MOCK_CLUBS.wydad,
      stats: stats(44, 41, 47, 45),
    }),
  },
  {
    caption: "Nom latin long, interface arabe · CHAMPION 11",
    lang: "ar",
    profile: mockProfile({
      name: "Les Lions du Derb Sidi Maarouf",
      ovr: 11,
      tier: "champion",
      serial: "300003",
      club: MOCK_CLUBS.raja,
      stats: stats(11, 12, 10, 11),
    }),
  },
];

/** The mock's tokens: one profile per step of the ladder. */
export const MOCK_TOKENS: readonly CardProfile[] = [
  { name: "Ali", ovr: null, tier: null, club: MOCK_CLUBS.raja },
  { name: "Hamza", ovr: 8, tier: "homa", club: null },
  { name: "Karim", ovr: 44, tier: "stade", club: MOCK_CLUBS.wydad },
  { name: "Ali", ovr: 11, tier: "pro", club: MOCK_CLUBS.raja },
  { name: "Abdelkarim", ovr: 88, tier: "champion", club: MOCK_CLUBS.fus },
  { name: "Yasmine", ovr: 99, tier: "legend", club: MOCK_CLUBS.far },
].map((t) =>
  mockProfile({ ...t, serial: null, stats: stats(null, null, null, null) } as Parameters<
    typeof mockProfile
  >[0]),
);
