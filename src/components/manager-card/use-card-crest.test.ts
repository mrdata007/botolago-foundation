import { describe, expect, it } from "bun:test";

import type { Club } from "@/types/domain";

import { findCardClub } from "./catalogue-club";
import { crestHref } from "./crest-href";
import { findUnsafeMarkup } from "./markup-safety";
import { CLUBS, PROFILES } from "./eclat/test-data";
import { crestCandidates, firstLoaded, withCrest } from "./use-card-crest";

const STORED = "https://media.example.test/storage/v1/object/public/football-media/teams/rca.png";

const appClub = (over: Partial<Club> & Pick<Club, "id">): Club => ({
  name: { fr: "Raja CA", ar: "الرجاء الرياضي" },
  shortName: { fr: "Raja", ar: "الرجاء" },
  city: { fr: "Casablanca", ar: "الدار البيضاء" },
  primaryColor: "#0a8f3a",
  crestPlaceholder: "RCA",
  ...over,
});

describe("crestHref: the addresses a card may draw", () => {
  it("takes https, local http and raster data images", () => {
    for (const ok of [
      STORED,
      "https://cdn.example.test/crest.svg?v=2&x=1",
      "http://127.0.0.1:54321/storage/v1/object/public/football-media/a.png",
      "http://localhost:54321/a.png",
      "data:image/png;base64,iVBORw0KGgo=",
      "data:image/webp;base64,UklGRg==",
    ]) {
      expect(crestHref(ok), ok).toBe(ok);
    }
  });

  it("refuses everything else", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "",
      "javascript:alert(1)",
      "http://evil.test/crest.png",
      "ftp://x.test/a.png",
      "//x.test/a.png",
      "/storage/a.png",
      'https://x.test/a.png" onload="alert(1)',
      "https://x.test/a.png'",
      "https://x.test/a b.png",
      "https://x.test/a.png)",
      "https://user:pw@x.test/a.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:text/html;base64,PGgxPg==",
      "data:image/png;base64,abc<script>",
      `https://x.test/${"a".repeat(2100)}.png`,
    ]) {
      expect(crestHref(bad), String(bad)).toBeNull();
    }
  });
});

describe("the markup check allows a picture only with such an address", () => {
  it("passes a crest image and flags an unsafe or missing href", () => {
    expect(findUnsafeMarkup(`<svg><image href="${STORED}" x="0" y="0"/></svg>`)).toEqual([]);
    expect(findUnsafeMarkup(`<svg><image href="https://x.test/a.png?w=1&amp;h=2"/></svg>`)).toEqual(
      [],
    );
    for (const tag of [
      `<image href="javascript:alert(1)"/>`,
      `<image href="http://evil.test/a.png"/>`,
      `<image xlink:href="data:image/svg+xml;base64,PHN2Zz4="/>`,
      `<image x="0"/>`,
    ]) {
      expect(findUnsafeMarkup(`<svg>${tag}</svg>`).length, tag).toBeGreaterThan(0);
    }
  });
});

describe("crestCandidates", () => {
  it("tries the image service's largest crest cut, then the stored original", () => {
    const origin = "https://proj.supabase.co";
    expect(
      crestCandidates(`${origin}/storage/v1/object/public/football-media/teams/rca.png`, origin),
    ).toEqual([
      `${origin}/storage/v1/render/image/public/football-media/teams/rca.png?width=128&height=128&resize=contain`,
      `${origin}/storage/v1/object/public/football-media/teams/rca.png`,
    ]);
    // not one of the project's own objects: the address as it is
    expect(crestCandidates(STORED, origin)).toEqual([STORED]);
  });

  it("has nothing to try for no crest or an address the card may not draw", () => {
    expect(crestCandidates(null)).toEqual([]);
    expect(crestCandidates(undefined)).toEqual([]);
    expect(crestCandidates("")).toEqual([]);
    expect(crestCandidates("http://evil.test/a.png")).toEqual([]);
  });
});

describe("firstLoaded: the crest is shown only once it has loaded", () => {
  it("answers the first address that loads", async () => {
    const tried: string[] = [];
    const loads = (src: string) => {
      tried.push(src);
      return Promise.resolve(src.endsWith("b.png"));
    };
    expect(await firstLoaded(["https://x.test/a.png", "https://x.test/b.png"], loads)).toBe(
      "https://x.test/b.png",
    );
    expect(tried).toEqual(["https://x.test/a.png", "https://x.test/b.png"]);
  });

  it("answers null when none loads (the initials disc stays)", async () => {
    expect(await firstLoaded(["https://x.test/a.png"], () => Promise.resolve(false))).toBeNull();
    expect(await firstLoaded([], () => Promise.resolve(true))).toBeNull();
  });
});

describe("withCrest", () => {
  it("sets the crest on the profile's club", () => {
    const p = withCrest(PROFILES.rated, STORED);
    expect(p.club).toEqual({ ...CLUBS.raja, crest: STORED });
    expect(PROFILES.rated.club).toEqual(CLUBS.raja);
  });

  it("removes it, and keeps the same object when nothing changes", () => {
    const p = withCrest(PROFILES.rated, STORED);
    expect(withCrest(p, null).club).toEqual(CLUBS.raja);
    expect(withCrest(p, STORED)).toBe(p);
    expect(withCrest(PROFILES.rated, null)).toBe(PROFILES.rated);
    expect(withCrest(PROFILES.clubNull, STORED)).toBe(PROFILES.clubNull);
  });
});

describe("findCardClub: the card's club in the app's catalogue", () => {
  const byId = appClub({ id: "u-raja", slug: "raja-ca", crestUrl: STORED });
  const other = appClub({
    id: "u-wydad",
    slug: "wydad-ac",
    name: { fr: "Wydad AC", ar: "الوداد" },
  });

  it("matches by id first", () => {
    expect(findCardClub([other, byId], { id: "u-raja", name: { fr: "x", ar: "y" } })).toBe(byId);
  });

  it("then by slug, then by name", () => {
    expect(
      findCardClub([other, byId], { id: "nope", slug: "raja-ca", name: { fr: "x", ar: "y" } }),
    ).toBe(byId);
    expect(findCardClub([other, byId], { id: "nope", name: { fr: "Raja C.A.", ar: "" } })?.id).toBe(
      "u-raja",
    );
  });

  it("answers undefined for a club the catalogue has not got", () => {
    expect(findCardClub([other], { id: "nope", name: { fr: "Raja CA", ar: "الرجاء" } })).toBe(
      undefined,
    );
    expect(findCardClub(undefined, { id: "u-raja", name: { fr: "Raja", ar: "" } })).toBe(undefined);
  });
});
