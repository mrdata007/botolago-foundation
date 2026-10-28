import { describe, expect, it } from "bun:test";

import type { Club } from "@/types/domain";
import { storyCaption } from "./story-caption";

const club = (code: string, fr: string, ar: string): Club => ({
  id: code,
  name: { fr, ar },
  shortName: { fr, ar },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: code,
});
const CLUBS = [
  club("FAR", "FAR Rabat", "الجيش"),
  club("FUS", "Fath", "الفتح"),
  club("RCA", "Raja", "الرجاء"),
  club("HUSA", "Hassania", "حسنية أكادير"),
];
const tr = (s: { fr: string; ar: string }) => s.ar;

describe("storyCaption", () => {
  it("keeps French as stored: it is the text the picture carries", () => {
    expect(storyCaption("KACM V DHJ", { lang: "fr", clubs: CLUBS, tr })).toEqual({
      text: "KACM V DHJ",
      dir: "ltr",
    });
  });

  it("never prints a Latin V in Arabic: names with an en dash, home first (right to left)", () => {
    expect(storyCaption("FAR V FUS", { lang: "ar", clubs: CLUBS, tr })).toEqual({
      text: "الجيش – الفتح",
      dir: "rtl",
    });
  });

  it("falls back to the two codes, with the same dash, when a club is unknown or the names are too long", () => {
    expect(storyCaption("KACM V DHJ", { lang: "ar", clubs: CLUBS, tr })).toEqual({
      text: "KACM – DHJ",
      dir: "ltr",
    });
    expect(storyCaption("RCA V HUSA", { lang: "ar", clubs: CLUBS, tr }).text).toBe("RCA – HUSA");
    expect(storyCaption("FAR V FUS", { lang: "ar", tr }).text).toBe("FAR – FUS");
  });

  it("leaves a label that is not a matchup alone", () => {
    expect(storyCaption("ACTU", { lang: "ar", clubs: CLUBS, tr }).text).toBe("ACTU");
    expect(storyCaption("RCA", { lang: "ar", clubs: CLUBS, tr }).text).toBe("RCA");
  });
});
