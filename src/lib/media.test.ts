import { describe, expect, test } from "bun:test";
import { MEDIA_WIDTHS, resolveMediaUrl, responsiveMedia } from "./media";

const SUPABASE_URL = "https://botolago-test.supabase.co";

describe("resolveMediaUrl", () => {
  test("prefers a validated HTTPS source over storage", () => {
    expect(
      resolveMediaUrl(
        {
          sourceUrl: "https://cdn.example.com/crests/raja.png",
          storagePath: "football/teams/1/crest.png",
        },
        SUPABASE_URL,
      ),
    ).toBe("https://cdn.example.com/crests/raja.png");
  });

  test("resolves football objects through football-media", () => {
    expect(resolveMediaUrl({ storagePath: "football/teams/1001/crest.png" }, SUPABASE_URL)).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/football-media/football/teams/1001/crest.png`,
    );
  });

  test("resolves news objects through news-media and encodes every path segment", () => {
    expect(resolveMediaUrl({ storagePath: "news/Équipe du jour/hero #1.webp" }, SUPABASE_URL)).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/news-media/news/%C3%89quipe%20du%20jour/hero%20%231.webp`,
    );
  });

  test("falls back from an invalid source URL to a valid storage path", () => {
    expect(
      resolveMediaUrl(
        { sourceUrl: "http://cdn.example.com/hero.jpg", storagePath: "news/hero.jpg" },
        SUPABASE_URL,
      ),
    ).toBe(`${SUPABASE_URL}/storage/v1/object/public/news-media/news/hero.jpg`);
  });

  test("returns no URL without configuration or valid media data", () => {
    expect(resolveMediaUrl({ storagePath: "news/hero.jpg" }, null)).toBeUndefined();
    expect(resolveMediaUrl({ storagePath: "other/hero.jpg" }, SUPABASE_URL)).toBeUndefined();
    expect(resolveMediaUrl({ storagePath: "news/../hero.jpg" }, SUPABASE_URL)).toBeUndefined();
    expect(resolveMediaUrl(undefined, SUPABASE_URL)).toBeUndefined();
  });
});

describe("responsiveMedia", () => {
  const RENDER = `${SUPABASE_URL}/storage/v1/render/image/public`;
  const crestUrl = `${SUPABASE_URL}/storage/v1/object/public/football-media/football/teams/16851/crest.png`;

  /** `srcset` candidates as [url, descriptor] pairs. */
  const candidates = (srcSet: string | undefined) =>
    (srcSet ?? "").split(", ").map((candidate) => candidate.split(" "));

  test("offers a crest as square resized copies and keeps the original as src", () => {
    const crest = responsiveMedia(crestUrl, "crest", "28px", SUPABASE_URL);
    expect(crest.src).toBe(crestUrl);
    expect(crest.sizes).toBe("28px");
    expect(candidates(crest.srcSet)).toEqual(
      MEDIA_WIDTHS.crest.map((width) => [
        `${RENDER}/football-media/football/teams/16851/crest.png?width=${width}&height=${width}&resize=contain`,
        `${width}w`,
      ]),
    );
  });

  test("resizes photos by width only, one copy per listed width", () => {
    const heroUrl = resolveMediaUrl({ storagePath: "news/2026/09/hero.jpg" }, SUPABASE_URL);
    const photo = responsiveMedia(heroUrl, "photo", "56px", SUPABASE_URL);
    expect(photo.src).toBe(heroUrl);
    expect(candidates(photo.srcSet)).toEqual(
      MEDIA_WIDTHS.photo.map((width) => [
        `${RENDER}/news-media/news/2026/09/hero.jpg?width=${width}`,
        `${width}w`,
      ]),
    );
  });

  test("keeps the path encoding resolveMediaUrl applied, so every candidate is one token", () => {
    const encoded = resolveMediaUrl(
      { storagePath: "news/Équipe du jour/hero #1.webp" },
      SUPABASE_URL,
    );
    const photo = responsiveMedia(encoded, "photo", "56px", SUPABASE_URL);
    for (const candidate of candidates(photo.srcSet)) {
      expect(candidate).toHaveLength(2);
      expect(candidate[0]).toStartWith(
        `${RENDER}/news-media/news/%C3%89quipe%20du%20jour/hero%20%231.webp?width=`,
      );
    }
  });

  test("leaves anything that is not our own Storage object as a plain src", () => {
    for (const url of [
      "https://images2.elbotola.com/article/abc_thumb.jpeg",
      "https://other-project.supabase.co/storage/v1/object/public/football-media/football/teams/1/crest.png",
      `${SUPABASE_URL}/storage/v1/object/public/avatars/user/avatar.png`,
      `${SUPABASE_URL}/storage/v1/object/public/news-media/news/../../x.webp`,
      `${SUPABASE_URL}/storage/v1/object/public/news-media/news/a.webp?download=1`,
    ]) {
      expect(responsiveMedia(url, "photo", "56px", SUPABASE_URL)).toEqual({ src: url });
    }
  });

  test("with no configured project, or no URL, nothing is resized", () => {
    expect(responsiveMedia(crestUrl, "crest", "28px", null)).toEqual({ src: crestUrl });
    expect(responsiveMedia(undefined, "crest", "28px", SUPABASE_URL)).toEqual({});
    expect(responsiveMedia(null, "photo", "56px", SUPABASE_URL)).toEqual({});
  });
});
