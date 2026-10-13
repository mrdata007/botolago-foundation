/**
 * Test support for the shield's tests: the card words of both languages (Éclat's test words, the
 * dictionaries' own) and a profile per case, written out as the development fixtures map them.
 * Built here rather than imported from `backend/manager-card/fixtures.ts` or the dictionaries: a
 * file that is not a test may not import either (`services/manager-card.test.ts`,
 * `i18n/arabic-on-demand.test.ts`). Not imported by the app.
 */
import { AR, FR } from "../eclat/test-data";
import type { CardProfile, CardStrings } from "../types";

export const STRINGS: Readonly<Record<"fr" | "ar", CardStrings>> = { fr: FR, ar: AR };

const RAJA = {
  id: "3c000003-0000-4000-8000-000000000001",
  slug: "raja-ca",
  initials: "RCA",
  name: { fr: "Raja CA", ar: "الرجاء الرياضي" },
  primary: "#0a8f3a",
  secondary: "#ffffff",
};

/** The `rated` fixture's profile. */
export const rated: CardProfile = {
  name: "Ali",
  ovr: 84,
  tier: "pro",
  provisional: true,
  counted: 3,
  minRated: 3,
  season: "2026/27",
  serial: "482913",
  founder: null,
  club: RAJA,
  stats: { cap: 91, sel: 82, trf: 86, con: 78 },
  statsKnown: true,
};
/** `forming1`: one journée of three, no number yet. */
export const forming: CardProfile = {
  ...rated,
  ovr: null,
  tier: null,
  provisional: false,
  counted: 1,
  stats: { cap: null, sel: null, trf: null, con: null },
};
export const founder: CardProfile = { ...rated, provisional: false, counted: 6, founder: 2026 };
export const arabicName: CardProfile = { ...rated, name: "فاطمة الزهراء" };
export const longName: CardProfile = { ...rated, name: "Abdelkarim Benjelloun-Alaoui" };
export const noClub: CardProfile = { ...rated, club: null };

/** The text content of the first element with `cls` in its class list. */
export function textOf(html: string, cls: string): string | null {
  const match = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>(.*?)</span>`).exec(html);
  return match ? match[1]!.replace(/<[^>]+>/g, "") : null;
}

/** Every class used in the markup. */
export const classesOf = (html: string): Set<string> =>
  new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/)));
