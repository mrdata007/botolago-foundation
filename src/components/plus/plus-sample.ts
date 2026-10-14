import type { CardProfile } from "@/components/manager-card/types";

/**
 * Example data for the offer, until lane C serves the real reads (the career detail and the
 * detailed duels). Everything here is shown as an example (the screens carry the « Exemple »
 * note); none of it is a person's real figures.
 *
 * TODO(lane C): replace `weeks` and `duel` with `get_my_card_career` / `get_card_duel`, and the
 * rival with a real friend of the member's leagues.
 */
export interface SamplePerson {
  name: string;
  clubShort: string;
  /** The club's accent, `#rrggbb`. */
  accent: string;
  stats: { cap: number; sel: number; trf: number; con: number };
}

export interface PlusSample {
  me: SamplePerson;
  rival: SamplePerson;
  /** Points per journée from `from`; the best one is highlighted. */
  weeks: { from: number; pts: readonly number[] };
  /** Head-to-head over the same journées: `w` you won it, `l` the rival did. */
  duel: { you: number; them: number; strip: string };
}

export const PLUS_SAMPLE: PlusSample = {
  me: {
    name: "Karim B.",
    clubShort: "KACM",
    accent: "#f2c230",
    stats: { cap: 76, sel: 72, trf: 68, con: 74 },
  },
  rival: {
    name: "Sami",
    clubShort: "RCA",
    accent: "#2fae6a",
    stats: { cap: 69, sel: 74, trf: 61, con: 70 },
  },
  weeks: { from: 3, pts: [48, 55, 39, 52, 60, 44, 71, 50, 63, 46, 58] },
  duel: { you: 7, them: 4, strip: "wlwwlwwlwlw" },
};

/** The index and journée of the best week. */
export function weekBest(weeks: PlusSample["weeks"]): {
  index: number;
  journee: number;
  pts: number;
} {
  let index = 0;
  weeks.pts.forEach((v, i) => {
    if (v > weeks.pts[index]!) index = i;
  });
  return { index, journee: weeks.from + index, pts: weeks.pts[index]! };
}

/**
 * A card to show someone who has none (a guest, or an account with no team): the sketch's
 * example, printed with the « Exemple » label by the card itself (`sample: true`).
 */
export const SAMPLE_CARD_PROFILE: CardProfile = {
  name: "Karim B.",
  ovr: 73,
  tier: "pro",
  provisional: false,
  counted: null,
  minRated: null,
  season: "2026/27",
  serial: "4821",
  founder: null,
  club: {
    id: "plus-sample-club",
    initials: "KACM",
    name: { fr: "Kawkab Marrakech", ar: "الكوكب المراكشي" },
    primary: "#f2c230",
    secondary: null,
  },
  stats: { cap: 76, sel: 72, trf: 68, con: 74 },
  statsKnown: true,
  sample: true,
};
