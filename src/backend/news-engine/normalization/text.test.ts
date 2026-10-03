import { describe, expect, test } from "bun:test";

import {
  ngrams,
  normalizeArticleText,
  normalizeEntityName,
  slugify,
  splitSentences,
  tokenize,
} from "./text";

describe("news engine entity name normalization", () => {
  test("folds the Arabic spellings of one club onto one key", () => {
    // These are the forms Moroccan reporting actually uses. If they diverge,
    // the alias table stops resolving and every story loses its club.
    const canonical = normalizeEntityName("الوداد الرياضي");
    expect(normalizeEntityName("الوداد الرياضى")).toBe(canonical);
    expect(normalizeEntityName("الوِداد الرِّياضي")).toBe(canonical);
    expect(normalizeEntityName("الــوداد الرياضي")).toBe(canonical);
    expect(normalizeEntityName("  الوداد   الرياضي  ")).toBe(canonical);
  });

  test("folds Latin accents and casing", () => {
    expect(normalizeEntityName("Difaâ El Jadida")).toBe("difaa el jadida");
    expect(normalizeEntityName("MOGHREB TÉTOUAN")).toBe("moghreb tetouan");
    expect(normalizeEntityName("Maghreb Fès")).toBe("maghreb fes");
    expect(normalizeEntityName("Olympique Dcheïra")).toBe("olympique dcheira");
  });

  test("reduces punctuation to separators without merging words", () => {
    expect(normalizeEntityName("Raja Club-Athletic!!")).toBe("raja club athletic");
    expect(normalizeEntityName("A.S. FAR")).toBe("a s far");
  });

  test("normalizes ta marbuta and hamza variants", () => {
    expect(normalizeEntityName("نهضة بركان")).toBe(normalizeEntityName("نهضه بركان"));
    expect(normalizeEntityName("أكادير")).toBe(normalizeEntityName("اكادير"));
  });

  test("returns empty string for values with no identity", () => {
    expect(normalizeEntityName(null)).toBe("");
    expect(normalizeEntityName("   ")).toBe("");
    expect(normalizeEntityName("!!!")).toBe("");
  });

  test("keeps different clubs distinct", () => {
    expect(normalizeEntityName("الوداد")).not.toBe(normalizeEntityName("الرجاء"));
    expect(normalizeEntityName("Wydad AC")).not.toBe(normalizeEntityName("Raja CA"));
  });
});

describe("news engine article text normalization", () => {
  test("strips markup and decodes entities", () => {
    const html = "<p>Raja &amp; Wydad</p><script>alert(1)</script><p>drew&nbsp;1-1</p>";
    expect(normalizeArticleText(html)).toBe("Raja & Wydad drew 1-1");
  });

  test("collapses blank runs but keeps paragraph breaks", () => {
    expect(normalizeArticleText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  test("removes bidirectional control characters", () => {
    expect(normalizeArticleText("‫الوداد‬")).toBe("الوداد");
  });
});

describe("news engine tokenization", () => {
  test("tokenizes Arabic and Latin the same way", () => {
    expect(tokenize("الوداد الرياضي")).toEqual(["الوداد", "الرياضي"]);
    expect(tokenize("Raja Club Athletic")).toEqual(["raja", "club", "athletic"]);
  });

  test("builds overlapping n-grams", () => {
    expect(ngrams(["a", "b", "c", "d"], 3)).toEqual(["a b c", "b c d"]);
    expect(ngrams(["a", "b"], 3)).toEqual([]);
  });

  test("splits sentences on Latin and Arabic punctuation", () => {
    expect(splitSentences("One. Two? Three؟ Four")).toEqual(["One.", "Two?", "Three؟", "Four"]);
  });
});

describe("news engine slugify", () => {
  test("produces a URL-safe Latin slug", () => {
    expect(slugify("Raja complete Ayoub signing")).toBe("raja-complete-ayoub-signing");
  });

  test("returns empty for Arabic-only input rather than guessing a transliteration", () => {
    // Callers must supply a Latin hint; a transliteration guess in a URL is
    // worse than an explicit key.
    expect(slugify("الوداد الرياضي")).toBe("");
  });

  test("respects the length cap and never ends in a hyphen", () => {
    const slug = slugify("a".repeat(200));
    expect(slug.length).toBeLessThanOrEqual(90);
    expect(slug.endsWith("-")).toBe(false);
  });
});
