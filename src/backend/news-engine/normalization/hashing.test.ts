import { describe, expect, test } from "bun:test";

import { canonicalizeArticleUrl, clusterKey, contentHash, urlHash } from "./hashing";

describe("news engine URL canonicalization", () => {
  test("drops tracking parameters, fragments and trailing slashes", () => {
    expect(
      canonicalizeArticleUrl(
        "https://www.elbotola.com/article/2026-09-21-15-00-907.html?utm_source=x&fbclid=y#top",
      ),
    ).toBe("https://www.elbotola.com/article/2026-09-21-15-00-907.html");
  });

  test("sorts remaining parameters so order cannot fork a duplicate", () => {
    const left = canonicalizeArticleUrl("https://example.com/a?b=2&a=1");
    const right = canonicalizeArticleUrl("https://example.com/a?a=1&b=2");
    expect(left).toBe(right);
  });

  test("lowercases the host but never the path", () => {
    expect(canonicalizeArticleUrl("https://WWW.Elbotola.COM/Article/X.html")).toBe(
      "https://www.elbotola.com/Article/X.html",
    );
  });

  test("strips embedded credentials", () => {
    expect(canonicalizeArticleUrl("https://user:pass@example.com/a")).toBe("https://example.com/a");
  });

  test("refuses anything that is not https", () => {
    expect(() => canonicalizeArticleUrl("http://example.com/a")).toThrow(
      "news_engine_non_https_url",
    );
  });

  test("hashes equal URLs to one key", () => {
    expect(urlHash("https://example.com/a?utm_source=x")).toBe(urlHash("https://example.com/a"));
    expect(urlHash("https://example.com/a")).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe("news engine content hashing", () => {
  test("ignores markup and whitespace differences", () => {
    const left = contentHash({ title: "Raja win", text: "<p>Raja  won   2-1.</p>" });
    const right = contentHash({ title: "raja win", text: "Raja won 2-1." });
    expect(left).toBe(right);
  });

  test("changes when the substance changes", () => {
    const left = contentHash({ title: "Raja win", text: "Raja won 2-1." });
    const right = contentHash({ title: "Raja win", text: "Raja won 3-1." });
    expect(left).not.toBe(right);
  });
});

describe("news engine cluster keys", () => {
  const base = {
    eventType: "official_signing",
    teamIds: ["11111111-1111-1111-1111-111111111111"],
    playerIds: ["22222222-2222-2222-2222-222222222222"],
    eventDate: "2026-09-21",
  };

  test("three reports of one event produce one key", () => {
    // "Player X joins Raja", "Raja complete X signing" and "Official: Raja
    // announce X" differ entirely as text but resolve to the same entities.
    expect(clusterKey(base)).toBe(clusterKey({ ...base }));
  });

  test("mention order cannot fork a cluster", () => {
    const forward = clusterKey({ ...base, teamIds: ["a", "b"], playerIds: ["c", "d"] });
    const reversed = clusterKey({ ...base, teamIds: ["b", "a"], playerIds: ["d", "c"] });
    expect(forward).toBe(reversed);
  });

  test("a different event keeps a different key", () => {
    expect(clusterKey(base)).not.toBe(
      clusterKey({ ...base, playerIds: ["33333333-3333-3333-3333-333333333333"] }),
    );
    expect(clusterKey(base)).not.toBe(clusterKey({ ...base, eventDate: "2026-09-22" }));
    expect(clusterKey(base)).not.toBe(clusterKey({ ...base, eventType: "injury" }));
  });

  test("falls back to normalized mentions when nothing resolved", () => {
    const left = clusterKey({
      eventType: "transfer_rumour",
      teamIds: [],
      playerIds: [],
      eventDate: null,
      fallbackMentions: ["الوداد الرياضي", "Ayoub"],
    });
    const right = clusterKey({
      eventType: "transfer_rumour",
      teamIds: [],
      playerIds: [],
      eventDate: null,
      fallbackMentions: ["Ayoub", "الوداد الرياضى"],
    });
    expect(left).toBe(right);
  });

  test("keys are prefixed with the event type for legibility", () => {
    expect(clusterKey(base).startsWith("official_signing:")).toBe(true);
  });
});
