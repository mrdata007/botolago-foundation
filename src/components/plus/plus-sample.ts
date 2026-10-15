import type { CardProfile } from "@/components/manager-card/types";

/**
 * Example data for the offer's other screens. The season and the duel of step 2 are in
 * `plus-season-data.ts`.
 */

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
