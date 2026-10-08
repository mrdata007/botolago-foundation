import { describe, expect, it } from "bun:test";

import { FIXTURES } from "@/backend/manager-card/fixtures";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";

import { activeRenderer } from "./active-renderer";
import { cardStrings, type Translate } from "./copy";
import { ALLOWED_CARD_TAGS, findUnsafeMarkup } from "./markup-safety";
import { esc, plainRenderer } from "./plain-renderer";
import { fromMember, fromMyCard } from "./to-profile";
import type { CardProfile } from "./types";

const tFor =
  (lang: "fr" | "ar"): Translate =>
  (key: TranslationKey) =>
    (dictionaries[lang] as Record<string, string>)[key] ?? key;
const STRINGS = { fr: cardStrings(tFor("fr"), "fr"), ar: cardStrings(tFor("ar"), "ar") };
const rated: CardProfile = fromMyCard(FIXTURES.rated.card!);

describe("the plain renderer", () => {
  it("has no beats and no motion", () => {
    expect(plainRenderer.beats).toEqual([]);
    expect(plainRenderer.beatMs("make")).toBe(0);
    expect(plainRenderer.id).toBe("plain-v1");
  });

  it("shows the number on the card, and the club's colour behind it", () => {
    const html = plainRenderer.full(rated, { strings: STRINGS.fr, theme: "light" });
    expect(html).toContain(">84</text>");
    expect(html).toContain(`fill="${rated.club!.primary}"`);
  });

  it("prints the sample label on a sample, and a serial in the format", () => {
    const html = plainRenderer.full(
      { ...rated, sample: true },
      { strings: STRINGS.ar, theme: "light" },
    );
    expect(html).toContain("مثال");
    expect(html).toContain("BOT #482913");
  });

  it("draws a league member's mini and token", () => {
    const member = fromMember(FIXTURES.rated.league!.members[0]!);
    expect(
      plainRenderer.token(member, { strings: STRINGS.fr, theme: "light", size: 28 }),
    ).not.toContain("<text");
    expect(
      plainRenderer.token(member, { strings: STRINGS.fr, theme: "light", size: 44 }),
    ).toContain(">78</text>");
  });

  it("is not the active renderer any more: Écharpe is, and its estimate is close to its own aspect", async () => {
    const active = await activeRenderer.load();
    expect(active).not.toBe(plainRenderer);
    expect(active.id).toBe(activeRenderer.id);
    const real = active.aspect(rated, STRINGS.fr);
    expect(Math.abs(activeRenderer.estimateAspect(rated, "fr") - real) / real).toBeLessThan(0.03);
  });
});

describe("esc", () => {
  it("escapes the five characters and drops control and bidi characters", () => {
    expect(esc(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
    expect(esc(`a${String.fromCodePoint(0x202e)}b${String.fromCodePoint(0x0)}c`)).toBe("abc");
  });
});

describe("markup safety", () => {
  it("accepts the allow-listed tags and nothing else", () => {
    expect(
      findUnsafeMarkup('<div role="img"><svg><g><rect/><text>a</text></g></svg></div>'),
    ).toEqual([]);
    expect(findUnsafeMarkup("<img src=x>")).toContain("tag <img> is not allowed");
    expect(findUnsafeMarkup("<svg><script>x</script></svg>").length).toBeGreaterThan(0);
    expect(findUnsafeMarkup('<svg onload="x()"></svg>').join()).toContain("event handler");
    expect(findUnsafeMarkup('<a href="javascript:x"></a>').join()).toContain("javascript:");
    expect(ALLOWED_CARD_TAGS).toContain("clipPath");
  });
});
