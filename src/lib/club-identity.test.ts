import { describe, expect, test } from "bun:test";

import {
  clubInitials,
  clubShortCode,
  clubShortName,
  compactClubName,
  rowClubName,
  withClubIdentity,
} from "@/lib/club-identity";
import type { Club, LocalizedString } from "@/types/domain";

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

describe("withClubIdentity and clubShortName: one name per club on every screen", () => {
  const club = (name: string, shortName: string, code: string, slug: string): Club => ({
    id: "7b2e23bc-0000-4000-8000-000000000001",
    slug,
    name: { fr: name, ar: name },
    shortName: { fr: shortName, ar: shortName },
    city: { fr: "", ar: "" },
    primaryColor: "var(--ui-ink)",
    crestPlaceholder: code,
  });
  const fr = (text: LocalizedString) => text.fr;
  const ar = (text: LocalizedString) => text.ar;

  test("gives a current club the table's short name, in both languages, and its code", () => {
    // Zemamra as production serves it: its derived letters were Raja's "RCA".
    const zemamra = withClubIdentity(
      club(
        "Renaissance Club Athletic Zemamra",
        "RCA Zemamra",
        "RCA",
        "cr-khemis-zemamra-dc6fb8196f3e",
      ),
    );
    expect(zemamra.crestPlaceholder).toBe("RCAZ");
    expect(clubShortName(zemamra, fr)).toBe("Zemamra");
    expect(clubShortName(zemamra, ar)).toBe("نهضة الزمامرة");
    // The full name stays for headings and assistive names.
    expect(zemamra.name.fr).toBe("Renaissance Club Athletic Zemamra");
  });

  test("prints Wydad, never the WCA its short name holds in the data", () => {
    const wydad = withClubIdentity(
      club("Wydad Casablanca", "WCA", "WCA", "wydad-casablanca-80a3fb8202ae"),
    );
    expect([clubShortName(wydad, fr), wydad.crestPlaceholder]).toEqual(["Wydad", "WAC"]);
  });

  test("returns a club outside the table as it is", () => {
    const safi = club("Olympic Safi", "Olympic Safi", "OLY", "olympic-safi-32fb7b619af4");
    expect(withClubIdentity(safi)).toBe(safi);
    expect(clubShortName(safi, fr)).toBe("Olympic Safi");
    // A short name that is only a code, or none at all, gives way to the name.
    expect(clubShortName(club("Club X", "CX", "CX", "club-x"), fr)).toBe("Club X");
    expect(clubShortName(club("Club X", " ", "CX", "club-x"), fr)).toBe("Club X");
  });
});
