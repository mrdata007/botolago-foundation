import { describe, expect, test } from "bun:test";

import { clubInitials, clubShortCode } from "@/lib/club-identity";

/**
 * BG-0111 — the pitch fixture plate rendered "(D)" with no opponent because
 * `app.clubs.code` is blank for 13 of the 21 active clubs and `?? ` does not
 * fall back on an empty string. These cases are the real production shapes:
 * `short_name` equals the full club name for 20 of the 21 clubs, and is the
 * literal "WCA" for Wydad Casablanca.
 */
describe("clubInitials", () => {
  test("returns an already-short name unchanged", () => {
    expect(clubInitials("WCA")).toBe("WCA");
    expect(clubInitials("FUS")).toBe("FUS");
  });

  test("takes word initials from a full club name", () => {
    expect(clubInitials("Raja Club Athletic")).toBe("RCA");
    expect(clubInitials("Wydad Athletic Club")).toBe("WAC");
    expect(clubInitials("Maghreb Association Sportive de Fès")).toBe("MAS");
  });

  test("skips lower-case particles, which no short code carries", () => {
    expect(clubInitials("Renaissance Sportive de Berkane")).toBe("RSB");
    expect(clubInitials("Ittihad Riadi de Tanger")).toBe("IRT");
  });

  test("falls back to the first three letters below three words", () => {
    expect(clubInitials("Berkane")).toBe("BER");
    // Two words: "WC" would be a worse identity than "WYD".
    expect(clubInitials("Wydad Casablanca")).toBe("WYD");
  });

  test("ignores punctuation and collapsed whitespace", () => {
    expect(clubInitials("  Union  Touarga-Sport ")).toBe("UTS");
  });

  test("never returns letters it was not given", () => {
    expect(clubInitials("")).toBe("");
    expect(clubInitials(null)).toBe("");
    expect(clubInitials(undefined)).toBe("");
    expect(clubInitials("   ")).toBe("");
  });
});

describe("clubShortCode", () => {
  test("prefers a real code", () => {
    expect(clubShortCode("RSB", "Renaissance Sportive de Berkane")).toBe("RSB");
    expect(clubShortCode("rsb", "Renaissance Sportive de Berkane")).toBe("RSB");
  });

  test("treats a blank code as absent — this is the defect", () => {
    // `team.code ?? derived` kept "" and shipped an empty plate.
    expect(clubShortCode("", "Raja Club Athletic")).toBe("RCA");
    expect(clubShortCode("   ", "Raja Club Athletic")).toBe("RCA");
    // The real production value for this club: short_name IS "WCA".
    expect(clubShortCode(null, "WCA")).toBe("WCA");
  });

  test("is empty only when neither source carries letters", () => {
    expect(clubShortCode(null, "")).toBe("");
  });
});
