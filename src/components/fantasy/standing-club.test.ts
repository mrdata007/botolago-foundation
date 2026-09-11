import { describe, expect, it } from "bun:test";
import type { Club } from "@/types/domain";
import { findStandingClub } from "./standing-club";

const club: Club = {
  id: "club-1",
  name: { fr: "Atlas", ar: "أطلس" },
  shortName: { fr: "ATL", ar: "أطلس" },
  city: { fr: "Rabat", ar: "الرباط" },
  primaryColor: "#123456",
  crestPlaceholder: "ATL",
};

describe("findStandingClub", () => {
  it("returns no club when standings do not provide one", () => {
    expect(findStandingClub({}, [club])).toBeUndefined();
  });

  it("returns no club for an unknown backend club id", () => {
    expect(findStandingClub({ clubId: "missing" }, [club])).toBeUndefined();
  });

  it("returns the exact backend-provided club", () => {
    expect(findStandingClub({ clubId: club.id }, [club])).toBe(club);
  });
});
