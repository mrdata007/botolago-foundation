import { describe, expect, it } from "bun:test";
import { showImagePlaceholder, usableImageUrl } from "./image-fallback";

describe("usableImageUrl", () => {
  it("is the URL, trimmed, when there is one", () => {
    expect(usableImageUrl("https://x.example/football/teams/1/crest.png")).toBe(
      "https://x.example/football/teams/1/crest.png",
    );
    expect(usableImageUrl("  https://x.example/a.png ")).toBe("https://x.example/a.png");
  });

  it("is undefined for everything that is not a URL to load", () => {
    for (const value of [null, undefined, "", "   ", "null", "undefined", "NULL"]) {
      expect(usableImageUrl(value)).toBeUndefined();
    }
  });
});

describe("showImagePlaceholder: the monogram / silhouette shows", () => {
  it("when the URL is null, undefined or blank", () => {
    expect(showImagePlaceholder(null, undefined)).toBe(true);
    expect(showImagePlaceholder(undefined, undefined)).toBe(true);
    expect(showImagePlaceholder("", undefined)).toBe(true);
    expect(showImagePlaceholder("null", undefined)).toBe(true);
  });

  it("when the URL given is the one that failed to load", () => {
    expect(showImagePlaceholder("https://x.example/a.png", "https://x.example/a.png")).toBe(true);
  });

  it("not while the image is loading or loaded", () => {
    expect(showImagePlaceholder("https://x.example/a.png", undefined)).toBe(false);
  });

  it("a different URL after a failure gets its own attempt", () => {
    expect(showImagePlaceholder("https://x.example/b.png", "https://x.example/a.png")).toBe(false);
  });
});
