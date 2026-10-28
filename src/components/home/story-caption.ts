import type { Club, Language, LocalizedString } from "@/types/domain";
import { bandClubName } from "./band-matches";

/** A matchup label as the stories are stored: two club codes joined by a Latin "V". */
const MATCHUP = /^([A-Z0-9]{2,6}) V ([A-Z0-9]{2,6})$/;

/**
 * The caption is one line under a story's circle, about 80px wide: more letters
 * than this in Arabic and it would be cut with an ellipsis.
 */
export const STORY_CAPTION_AR_FIT = 13;

export interface StoryCaption {
  readonly text: string;
  /** Codes read left to right as the picture does; Arabic names read right to left, home first. */
  readonly dir: "ltr" | "rtl";
}

/**
 * The caption under a generated story's circle ("KACM V DHJ"), for the reader's
 * language.
 *
 * French keeps the label as stored: it is the very text the story's picture
 * carries. Arabic does not print a Latin "V": the two clubs are joined by an en
 * dash, and each is written as its short name (the name Home's cards use,
 * `bandClubName`) when the club is known from its code and both names fit the
 * line; otherwise by the two codes, with the same dash. A label that is not a
 * matchup ("Actu", a single club) is returned as it is, left to right.
 */
export function storyCaption(
  label: string,
  {
    lang,
    clubs,
    tr,
  }: {
    lang: Language;
    clubs?: readonly Club[];
    tr: (text: LocalizedString) => string;
  },
): StoryCaption {
  if (lang !== "ar") return { text: label, dir: "ltr" };
  const match = MATCHUP.exec(label);
  if (!match) return { text: label, dir: "ltr" };
  const [, homeCode = "", awayCode = ""] = match;
  const byCode = (code: string) => clubs?.find((club) => club.crestPlaceholder === code);
  const home = byCode(homeCode);
  const away = byCode(awayCode);
  if (home && away) {
    const names = `${bandClubName(home, tr)} – ${bandClubName(away, tr)}`;
    if (names.length <= STORY_CAPTION_AR_FIT) return { text: names, dir: "rtl" };
  }
  return { text: `${homeCode} – ${awayCode}`, dir: "ltr" };
}
