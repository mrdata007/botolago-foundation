import { describe, expect, it } from "bun:test";

import { FIXTURE_IDS, FIXTURES } from "@/backend/manager-card/fixtures";
import type { Club } from "@/types/domain";

import {
  cardClubFromClub,
  clubInitials,
  fromHistoryRow,
  fromMember,
  fromMyCard,
  guestProfile,
  localProfile,
  toCardClub,
  withTier,
} from "./to-profile";

const own = (id: keyof typeof FIXTURES) => FIXTURES[id].card!;

describe("fromMyCard", () => {
  it("passes the server's numbers through, unchanged", () => {
    const profile = fromMyCard(own("rated"));
    expect(profile).toMatchObject({
      name: "Ali",
      ovr: 84,
      tier: "pro",
      provisional: true,
      counted: 3,
      minRated: 3,
      season: "2026/27",
      serial: "482913",
      founder: null,
      stats: { cap: 91, sel: 82, trf: 86, con: 78 },
    });
    expect(profile.sample).toBeUndefined();
    expect(profile.club).toMatchObject({
      initials: "RCA",
      name: { fr: "Raja CA", ar: "الرجاء الرياضي" },
    });
    expect(profile.club?.primary).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each([...FIXTURE_IDS])("draws the %s fixture without inventing anything", (id) => {
    const card = FIXTURES[id].card;
    if (!card) return;
    const profile = fromMyCard(card);
    expect(profile.name).toBe(card.name);
    expect(profile.serial).toBe(card.serial);
    expect(profile.founder).toBe(card.founder?.cohort ?? null);
    // A null number stays null: a dash on the card, never 0.
    if (card.ratingState !== "forming" || !card.previousSeason) expect(profile.ovr).toBe(card.ovr);
    expect(profile.ovr === null || profile.ovr >= 1).toBe(true);
    expect(profile.tier === null || profile.ovr !== null).toBe(true);
  });

  it("marks a development sample only when told to, or in mock data mode (never under test)", () => {
    expect(fromMyCard(own("rated"), { sample: true }).sample).toBe(true);
    expect(fromMyCard(own("rated"), { sample: false }).sample).toBeUndefined();
    expect(fromMyCard(own("rated")).sample).toBeUndefined();
  });

  it("shows the founder year, and no founder part otherwise", () => {
    expect(fromMyCard(own("founder")).founder).toBe(2026);
    expect(fromMyCard(own("rated")).founder).toBeNull();
  });

  it("keeps a forming card's dash and its marks", () => {
    const profile = fromMyCard(own("forming1"));
    expect(profile).toMatchObject({ ovr: null, tier: null, counted: 1, minRated: 3 });
    expect(profile.stats).toEqual({ cap: null, sel: null, trf: null, con: null });
    expect(fromMyCard(own("insufficient3"))).toMatchObject({ ovr: null, counted: 3 });
  });

  it("D7: a new season with no number yet shows last season's number, tier and label, with no marks", () => {
    const profile = fromMyCard(own("seasonStarted"));
    expect(profile).toMatchObject({
      ovr: 86,
      tier: "pro",
      season: "2026/27",
      counted: null,
      provisional: false,
    });
    expect(profile.stats).toEqual({ cap: null, sel: null, trf: null, con: null });
    // Once this season has a number of its own it shows that one.
    const rated = {
      ...own("seasonStarted"),
      ratingState: "rated" as const,
      ovr: 80,
      tier: "stade" as const,
    };
    expect(fromMyCard(rated)).toMatchObject({ ovr: 80, season: "2027/28" });
  });

  it("has no club part when the card has no club", () => {
    expect(fromMyCard(own("clubNull")).club).toBeNull();
  });
});

describe("fromMember and fromHistoryRow", () => {
  it("draws a league member's card, forming or rated", () => {
    const [karim, salma, yasmine] = FIXTURES.rated.league!.members;
    expect(fromMember(karim!)).toMatchObject({
      name: "KARIM",
      ovr: 78,
      tier: "stade",
      season: "2026/27",
    });
    expect(fromMember(salma!)).toMatchObject({ ovr: null, tier: null, counted: 2, minRated: 3 });
    expect(fromMember(yasmine!).founder).toBe(2026);
  });

  it("draws a stored journée on the manager's own name, club and number", () => {
    const card = own("rated");
    const row = FIXTURES.rated.history[0]!;
    const profile = fromHistoryRow(row, card);
    expect(profile).toMatchObject({
      name: "Ali",
      serial: "482913",
      ovr: row.ovr,
      tier: row.tier,
      provisional: row.provisional,
      season: row.seasonLabel,
      counted: row.gameweeksCounted,
    });
    expect(profile.stats).toEqual(row.stats);
  });
});

describe("withTier, guestProfile and localProfile", () => {
  it("draws the same card at another tier", () => {
    const profile = fromMyCard(own("rated"));
    expect(withTier(profile, "legend")).toEqual({ ...profile, tier: "legend" });
    expect(profile.tier).toBe("pro");
  });

  it("is the unnamed base scarf for a guest: nothing is filled in", () => {
    expect(guestProfile()).toEqual({
      name: "",
      ovr: null,
      tier: null,
      provisional: false,
      counted: null,
      minRated: null,
      season: "",
      serial: null,
      founder: null,
      club: null,
      stats: { cap: null, sel: null, trf: null, con: null },
    });
    const club = fromMyCard(own("rated")).club;
    expect(guestProfile({ season: "2026/27", club })).toMatchObject({ season: "2026/27", club });
  });

  it("carries a signed-in account's name and favourite club on the base scarf", () => {
    const raja: Club = {
      id: "rca",
      name: { fr: "Raja CA", ar: "الرجاء الرياضي" },
      shortName: { fr: "RCA", ar: "الرجاء" },
      city: { fr: "Casablanca", ar: "الدار البيضاء" },
      primaryColor: "#0a8f3a",
      crestPlaceholder: "RCA",
    };
    const profile = localProfile({ displayName: " Karim ", club: raja });
    expect(profile).toMatchObject({ name: "Karim", ovr: null, serial: null, counted: null });
    expect(profile.club).toMatchObject({ id: "rca", initials: "RCA", primary: "#0a8f3a" });
    expect(localProfile({ displayName: "Karim", club: null }).club).toBeNull();
    // An already-made card club is taken as it is.
    expect(localProfile({ displayName: "K", club: profile.club }).club).toBe(profile.club);
  });
});

describe("clubs on the card", () => {
  it("takes the colour through the club palette, never from a literal", () => {
    const dto = own("rated").club!;
    expect(toCardClub(dto)?.primary).toBe("#0a8f3a");
    expect(toCardClub({ ...dto, primaryColor: "#123456" })?.primary).toBe("#123456");
    expect(toCardClub({ ...dto, secondaryColor: "#ffd400" })?.secondary).toBe("#ffd400");
  });

  it("has no club part for a club the palette has no colour for", () => {
    const dto = {
      ...own("rated").club!,
      slug: "club-sans-couleur",
      name: { fr: "Club Inconnu", ar: "نادٍ" },
      shortName: { fr: "Inconnu", ar: "نادٍ" },
    };
    expect(toCardClub(dto)).toBeNull();
    expect(toCardClub(null)).toBeNull();
    expect(cardClubFromClub(undefined)).toBeNull();
  });

  it("makes two or three letters for a disc", () => {
    expect(clubInitials("RCA", "Raja", "Raja CA")).toBe("RCA");
    expect(clubInitials("wac", "Wydad", "Wydad AC")).toBe("WAC");
    expect(clubInitials(null, "Raja", "Raja CA")).toBe("RA");
    expect(clubInitials(null, "RS Berkane", "Renaissance Sportive de Berkane")).toBe("RB");
    expect(clubInitials(null, "Maghreb de Fès", "x")).toBe("MF");
    expect(clubInitials(null, "Olympique Club de Safi", "x")).toBe("OCS");
    expect(clubInitials("", "Hassania Agadir", "x")).toBe("HA");
    expect(clubInitials(null, "Étoile Sportive", "x")).toBe("ES");
    expect(clubInitials(null, "", "")).toBe("CL");
  });
});
