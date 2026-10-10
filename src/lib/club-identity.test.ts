import { describe, expect, test } from "bun:test";

import { clubInitials, clubShortCode, compactClubName, rowClubName } from "@/lib/club-identity";

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

describe("compactClubName", () => {
  // The real full names the league publishes (see the cases above).
  test("keeps the distinctive words of a full French name", () => {
    expect(compactClubName("Raja Club Athletic", "fr")).toBe("Raja");
    expect(compactClubName("Wydad Athletic Club", "fr")).toBe("Wydad");
    expect(compactClubName("Renaissance Sportive de Berkane", "fr")).toBe("Renaissance Berkane");
    expect(compactClubName("Maghreb Association Sportive de Fès", "fr")).toBe("Maghreb Fès");
    expect(compactClubName("Ittihad Riadi de Tanger", "fr")).toBe("Ittihad Tanger");
    expect(compactClubName("Difaâ Hassani d'El Jadida", "fr")).toBe("Difaâ El Jadida");
    expect(compactClubName("Hassania Union Sport d'Agadir", "fr")).toBe("Hassania Agadir");
  });

  test("leaves a name that fits, and initialisms, alone", () => {
    expect(compactClubName("RS Berkane", "fr")).toBe("RS Berkane");
    expect(compactClubName("AS FAR", "fr")).toBe("AS FAR");
    expect(compactClubName("Wydad AC", "fr")).toBe("Wydad AC");
  });

  test("leaves a long name with nothing generic in it for the layout to wrap", () => {
    expect(compactClubName("Renaissance Zemamra", "fr")).toBe("Renaissance Zemamra");
  });

  test("drops the generic words of an Arabic name", () => {
    expect(compactClubName("نادي الرجاء الرياضي لكرة القدم", "ar")).toBe("الرجاء");
    expect(compactClubName("الوداد الرياضي", "ar", 8)).toBe("الوداد");
    expect(compactClubName("نهضة بركان", "ar")).toBe("نهضة بركان");
    expect(compactClubName("الدفاع الحسني الجديدي", "ar")).toBe("الدفاع الجديدي");
  });

  test("never returns an empty name", () => {
    expect(compactClubName("Club Sportif", "fr", 4)).toBe("Club Sportif");
    expect(compactClubName("", "fr")).toBe("");
  });

  test("tidies stray spaces", () => {
    expect(compactClubName("  Raja   Club  Athletic ", "fr")).toBe("Raja");
  });
});
