import { describe, expect, test } from "bun:test";

import type { Club } from "@/types/domain";
import { findClub } from "./club-lookup";

const club = (id: string, slug?: string): Club => ({
  id,
  slug,
  name: { fr: id, ar: id },
  shortName: { fr: id, ar: id },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: id.slice(0, 3).toUpperCase(),
});

describe("findClub", () => {
  const clubs = [club("7f3c-uuid-wydad", "war"), club("91aa-uuid-raja", "rca"), club("war")];

  test("matches on the id first (cloud mode: players carry the club UUID)", () => {
    expect(findClub(clubs, "91aa-uuid-raja")?.slug).toBe("rca");
  });

  test("an exact id wins over another club's slug", () => {
    // "war" is both the third club's id and the first club's slug.
    expect(findClub(clubs, "war")?.id).toBe("war");
  });

  test("falls back to the slug (mock mode: players carry the source slug)", () => {
    expect(findClub([clubs[0]!, clubs[1]!], "rca")?.id).toBe("91aa-uuid-raja");
  });

  test("answers undefined for an unknown or missing id", () => {
    expect(findClub(clubs, "nope")).toBeUndefined();
    expect(findClub(clubs, "")).toBeUndefined();
    expect(findClub(clubs, null)).toBeUndefined();
    expect(findClub(clubs, undefined)).toBeUndefined();
  });
});
