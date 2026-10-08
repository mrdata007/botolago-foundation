import { describe, expect, it } from "bun:test";

import type { CardClubDto } from "@/backend/manager-card/contracts";
import { FIXTURES } from "@/backend/manager-card/fixtures";
import type { Club } from "@/types/domain";

import { clubFromCard, resolveClub } from "./club-resolve";

const dto: CardClubDto = FIXTURES.rated.card!.club!;
const app = (over: Partial<Club> = {}): Club => ({
  id: "x",
  name: { fr: "Raja CA", ar: "الرجاء الرياضي" },
  shortName: { fr: "RCA", ar: "الرجاء" },
  city: { fr: "Casablanca", ar: "الدار البيضاء" },
  primaryColor: "#0a8f3a",
  crestPlaceholder: "RCA",
  ...over,
});

describe("the card's club and the app's club", () => {
  it("matches by id first", () => {
    const wanted = app({ id: dto.id });
    expect(resolveClub([app({ id: "other", name: { fr: "Autre", ar: "آخر" } }), wanted], dto)).toBe(
      wanted,
    );
  });
  it("matches by slug, then by name, for clubs the two sides key differently", () => {
    const bySlug = app({ id: "u", slug: "raja-ca", name: { fr: "Autre", ar: "آخر" } });
    expect(resolveClub([bySlug], dto)).toBe(bySlug);
    const byName = app();
    expect(resolveClub([byName], dto)).toBe(byName);
  });
  it("draws a club from the card when the list has none, and none for no club", () => {
    const drawn = resolveClub([], dto)!;
    expect(drawn.id).toBe(dto.id);
    expect(drawn.name.fr).toBe("Raja CA");
    expect(drawn.crestPlaceholder).toBe("RCA");
    expect(resolveClub([app()], null)).toBeNull();
    expect(clubFromCard({ ...dto, code: null, city: null }).city.fr).toBe("");
  });
});
