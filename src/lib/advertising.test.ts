import { describe, expect, test } from "bun:test";
import {
  ADVERTISING,
  adSenseReady,
  advertisingTxt,
  adsVisitorAllowed,
  validSponsor,
  type AdSettings,
} from "./advertising";

describe("advertising readiness", () => {
  test("ships inactive, without fabricated publisher records", () => {
    expect(adSenseReady(ADVERTISING, "homeFeed")).toBe(false);
    expect(advertisingTxt(ADVERTISING)).toBeNull();
  });
  test("requires explicit activation and a unit for each placement", () => {
    const config: AdSettings = {
      ...ADVERTISING,
      enabled: true,
      publisherId: "ca-pub-1234567890123456",
      units: { homeFeed: "1234567890", newsFeed: "", articleEnd: "" },
    };
    expect(adSenseReady(config, "homeFeed")).toBe(true);
    expect(adSenseReady(config, "articleEnd")).toBe(false);
    expect(adSenseReady({ ...config, enabled: false }, "homeFeed")).toBe(false);
    expect(adSenseReady({ ...config, publisherId: "example" }, "homeFeed")).toBe(false);
  });
  test("ads.txt must match the configured account", () => {
    const config = {
      ...ADVERTISING,
      publisherId: "ca-pub-1234567890123456",
      sellerId: "pub-1234567890123456",
    };
    expect(advertisingTxt(config)).toBe(
      "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n",
    );
    expect(advertisingTxt({ ...config, sellerId: "pub-0000000000000000" })).toBeNull();
  });
  test("members, native apps and unresolved membership never qualify for ad requests", () => {
    const free = {
      ready: true,
      member: false,
      native: false,
      authReady: true,
      membershipKnown: true,
    };
    expect(adsVisitorAllowed(free)).toBe(true);
    for (const change of [
      { member: true },
      { native: true },
      { ready: false },
      { authReady: false },
      { membershipKnown: false },
    ])
      expect(adsVisitorAllowed({ ...free, ...change })).toBe(false);
  });
  test("sponsor links and images are local or HTTPS, with accessible copy", () => {
    expect(
      validSponsor({ image: "/brand.webp", href: "https://brand.example", alt: "Brand" }),
    ).toBe(true);
    expect(
      validSponsor({
        image: "//other.example/brand.webp",
        href: "https://brand.example",
        alt: "Brand",
      }),
    ).toBe(false);
    expect(validSponsor({ image: "/brand.webp", href: "javascript:alert(1)", alt: "Brand" })).toBe(
      false,
    );
    expect(validSponsor({ image: "/brand.webp", href: "https://brand.example", alt: "" })).toBe(
      false,
    );
  });
});
