import { describe, expect, it } from "bun:test";

import { dictionaryInChunk } from "./dictionary-chunk";

/**
 * A retry of the Arabic dictionary under a URL of its own
 * (`retryable-import.ts`) gets the chunk as the bundler emitted it, whose
 * exports may have been renamed; the provider finds the dictionary in it by
 * what it holds (audit 2026-09-25, A10).
 */

describe("dictionaryInChunk — a dictionary chunk fetched by URL on a retry", () => {
  const ar = { "language.choose_title": "اختر لغتك", "app.name": "BotolaGO" };

  it("finds the dictionary in the module as written", () => {
    expect(dictionaryInChunk({ ar }, "language.choose_title")).toBe(ar);
  });

  it("finds it among exports the bundler renamed", () => {
    expect(dictionaryInChunk({ n: { ar }, t: ar }, "language.choose_title")).toBe(ar);
    expect(dictionaryInChunk({ n: { ar } }, "language.choose_title")).toBe(ar);
  });

  it("finds nothing in anything else", () => {
    expect(dictionaryInChunk({ t: { other: "x" } }, "language.choose_title")).toBeNull();
    expect(dictionaryInChunk({ t: "language.choose_title" }, "language.choose_title")).toBeNull();
    expect(dictionaryInChunk(null, "language.choose_title")).toBeNull();
    expect(dictionaryInChunk(undefined, "language.choose_title")).toBeNull();
  });
});
