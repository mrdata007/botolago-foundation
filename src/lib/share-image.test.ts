import { describe, expect, it } from "bun:test";
import { crestShareMeta, rasterShareImageUrl } from "./share-image";

describe("rasterShareImageUrl", () => {
  it("keeps an absolute https raster", () => {
    expect(rasterShareImageUrl("https://cdn.example.com/crest.png")).toBe(
      "https://cdn.example.com/crest.png",
    );
    expect(rasterShareImageUrl("https://cdn.example.com/a/b.webp?v=2")).toBe(
      "https://cdn.example.com/a/b.webp?v=2",
    );
  });

  it("refuses vectors, plain http, relative paths and blanks", () => {
    expect(rasterShareImageUrl("https://cdn.example.com/crest.svg")).toBeUndefined();
    expect(rasterShareImageUrl("https://cdn.example.com/crest.SVG?x=1")).toBeUndefined();
    expect(rasterShareImageUrl("http://cdn.example.com/crest.png")).toBeUndefined();
    expect(rasterShareImageUrl("/crests/raja.png")).toBeUndefined();
    expect(rasterShareImageUrl("null")).toBeUndefined();
    expect(rasterShareImageUrl(undefined)).toBeUndefined();
  });
});

describe("crestShareMeta", () => {
  it("gives the picture and its alt for og and twitter", () => {
    const meta = crestShareMeta("https://cdn.example.com/crest.png", "Écusson Raja");
    expect(meta).toContainEqual({
      property: "og:image",
      content: "https://cdn.example.com/crest.png",
    });
    expect(meta).toContainEqual({ property: "og:image:alt", content: "Écusson Raja" });
    expect(meta).toContainEqual({
      name: "twitter:image",
      content: "https://cdn.example.com/crest.png",
    });
  });

  it("gives nothing without a usable crest, so the root's picture stands", () => {
    expect(crestShareMeta(undefined, "x")).toEqual([]);
    expect(crestShareMeta("https://cdn.example.com/crest.svg", "x")).toEqual([]);
  });
});
