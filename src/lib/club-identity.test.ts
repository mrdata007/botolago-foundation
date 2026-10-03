import { describe, expect, test } from "bun:test";

import {
  clubInitials,
  clubShortCode,
  rowClubName,
  uniqueClubShortCodes,
} from "@/lib/club-identity";

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

describe("rowClubName", () => {
  test("a short name that is only a code gives way to the club's name", () => {
    expect(rowClubName("WCA", "Wydad Casablanca")).toBe("Wydad Casablanca");
  });

  test("a short name that is words stays, in either script", () => {
    expect(rowClubName("RCA Zemamra", "Renaissance Club Athletic Zemamra")).toBe("RCA Zemamra");
    expect(rowClubName("FUS Rabat", "FUS Rabat")).toBe("FUS Rabat");
    expect(rowClubName("الوداد", "الوداد الرياضي")).toBe("الوداد");
  });
});

describe("uniqueClubShortCodes", () => {
  // Real production shapes: Raja carries the code "RCA"; Zemamra carries none
  // and its French short name is "RCA Zemamra", which used to come out as "RCA".
  const raja = { id: "raja", code: "RCA", shortName: "Raja Casablanca" };
  const zemamra = { id: "zemamra", code: null, shortName: "RCA Zemamra" };

  test("gives the club without a code a distinct one when letters collide", () => {
    const codes = uniqueClubShortCodes([raja, zemamra]);
    expect(codes.get("raja")).toBe("RCA");
    expect(codes.get("zemamra")).toBe("RCAZ");
  });

  test("is the same whichever order the clubs arrive in", () => {
    const codes = uniqueClubShortCodes([zemamra, raja]);
    expect(codes.get("raja")).toBe("RCA");
    expect(codes.get("zemamra")).toBe("RCAZ");
  });

  test("never touches a club that has its own code", () => {
    const codes = uniqueClubShortCodes([
      { id: "a", code: "FUS", shortName: "FUS Rabat" },
      { id: "b", code: null, shortName: "Wydad Casablanca" },
    ]);
    expect(codes.get("a")).toBe("FUS");
    expect(codes.get("b")).toBe("WYD");
  });

  test("leaves a shared code alone when nothing distinct can be built", () => {
    const codes = uniqueClubShortCodes([
      { id: "a", code: "ABC", shortName: "A" },
      { id: "b", code: "ABC", shortName: "B" },
    ]);
    expect(codes.get("a")).toBe("ABC");
    expect(codes.get("b")).toBe("ABC");
  });

  test("ends with no repeated code across a whole league", () => {
    const codes = uniqueClubShortCodes([
      raja,
      zemamra,
      { id: "wac", code: "WCA", shortName: "WCA" },
      { id: "far", code: "ASFAR", shortName: "FAR Rabat" },
    ]);
    expect(new Set(codes.values()).size).toBe(codes.size);
  });
});
