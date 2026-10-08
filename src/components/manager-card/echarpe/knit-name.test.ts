import { describe, expect, it } from "bun:test";

import { HOSTILE_NAMES } from "./test-data";
import { knitName, MAX_NAME_CHARS } from "./knit-name";

describe("knitName (plan 6.4.1)", () => {
  const table: [string, string, "latin" | "arabic" | "none"][] = [
    ["ali", "ALI", "latin"],
    ["  Ali   Ben  ", "ALI BEN", "latin"],
    // accents fold to their base letter, ligatures and stroked letters are spelled out
    ["Élodie Côté", "ELODIE COTE", "latin"],
    ["Zoë Łukasz", "ZOE LUKASZ", "latin"],
    ["Søren Æsir", "SOREN AESIR", "latin"],
    ["Straße", "STRASSE", "latin"],
    // hyphens stay, apostrophes and dots go, digits go
    ["Jean-Pierre", "JEAN-PIERRE", "latin"],
    ["Jean – Pierre", "JEAN-PIERRE", "latin"],
    ["M'Barek", "MBAREK", "latin"],
    ["Ali07", "ALI", "latin"],
    ["12345", "", "none"],
    // emoji and symbols are removed, not knitted
    ["Ali 😀", "ALI", "latin"],
    ["😀🔥", "", "none"],
    ["Ali★Best", "ALIBEST", "latin"],
    ["", "", "none"],
    ["   ", "", "none"],
    // Arabic: letters and spaces only, no tatweel or harakat
    ["علي", "علي", "arabic"],
    ["عـلـي", "علي", "arabic"],
    ["عَلِيّ", "علي", "arabic"],
    ["فاطمة الزهراء", "فاطمة الزهراء", "arabic"],
    ["علي ٣٤", "علي", "arabic"],
    // a mixed name takes the Arabic path, whatever the interface language
    ["Ali علي", "علي", "arabic"],
    ["علي Ali 😀", "علي", "arabic"],
  ];
  for (const [raw, text, script] of table)
    it(`${JSON.stringify(raw)} → ${script} ${JSON.stringify(text)}`, () => {
      expect(knitName(raw)).toEqual({ script, text });
    });

  it("knits at most 24 characters, cut at a word boundary", () => {
    const long = "Abdelkarim Benjelloun-Alaoui";
    const k = knitName(long);
    expect(k.text.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
    expect(k.text).toBe("ABDELKARIM");
    // a single long word is cut where it is
    expect(knitName("A".repeat(30)).text).toBe("A".repeat(MAX_NAME_CHARS));
    // the cut never leaves a trailing space or hyphen
    expect(knitName("Mohammed Abderrahmane Benjelloun").text).toBe("MOHAMMED ABDERRAHMANE");
    expect(knitName("AAAAAAAAAAAAAAAAAAAAAAA- BBB").text).toBe("AAAAAAAAAAAAAAAAAAAAAAA");
    const ar = knitName("عبد الله يوسف عبد الرحمن بن محمد الإدريسي");
    expect(ar.script).toBe("arabic");
    expect([...ar.text].length).toBeLessThanOrEqual(MAX_NAME_CHARS);
    expect(ar.text.endsWith(" ")).toBe(false);
  });

  it("only ever returns letters, spaces and hyphens, whatever it is given", () => {
    for (const raw of [...HOSTILE_NAMES, "\u0000\u0007x", "‮evil", "A​B"]) {
      const k = knitName(raw);
      if (k.script === "latin") expect(k.text).toMatch(/^[A-Z]+(?:[ -][A-Z]+)*$/);
      if (k.script === "arabic") expect(k.text).toMatch(/^[\p{Script=Arabic} ]+$/u);
    }
  });
});
