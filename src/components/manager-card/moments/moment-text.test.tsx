import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { FIXTURES, type FixtureId } from "@/backend/manager-card/fixtures";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

import { pickHero } from "./moments";
import {
  bornText,
  compactBornLines,
  formatCutoff,
  heroText,
  lineText,
  momentWords,
  replayView,
  type MomentWords,
} from "./moment-text";
import { deriveReplayItems } from "./moments";

/**
 * The words of the moments, both languages, from the real dictionaries: the sentences of the
 * approved copy with their numbers isolated, no manager's name in a heading, ·26 only for the
 * founder, no serial sentence while the serial is null, and no banned word (plan 2.5).
 */

const words = (lang: Language): MomentWords =>
  momentWords((key: TranslationKey) => dictionaries[lang][key], lang);
const html = (node: unknown) => renderToStaticMarkup(<>{node as never}</>);
const text = (node: unknown) =>
  html(node)
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'");
const card = (id: FixtureId): MyCardDto => FIXTURES[id].card!;

function heroOf(id: FixtureId, minutes: number | null = 1000) {
  const c = card(id);
  const picked = pickHero(c.moments, {
    surface: "curva",
    card: c,
    minutesToDeadline: minutes,
    heroShownThisSession: false,
    launchGateOpen: true,
    latestEvaluatedGameweekSeq: c.throughGameweekSeq,
  });
  return { c, hero: picked.hero };
}

describe("the heroes' sentences (French)", () => {
  const fr = words("fr");

  it("fresh: « Première note · J7 » and « Provisoire jusqu'à 5 journées terminées. »", () => {
    const { c, hero } = heroOf("rated");
    const out = heroText(hero!, c, fr);
    expect(text(out.label)).toBe("Première note · J7");
    expect(out.lines.map(text)).toEqual(["Provisoire jusqu’à 5 journées terminées."]);
    expect(out.primary).toBe("Voir le détail");
  });

  it("arrival: counts the journées of the season", () => {
    const { c, hero } = heroOf("launchArrival");
    const out = heroText(hero!, c, fr);
    expect(text(out.label)).toBe("Votre carte de manager est là");
    expect(out.lines.map(text)).toEqual(["Calculée sur 7 journées terminées de votre saison."]);
  });

  it("coalesced: the first rating and today's, in the label", () => {
    const { c, hero } = heroOf("returning");
    const out = heroText(hero!, c, fr);
    expect(text(out.label)).toBe("Première note : 84 (J3). Aujourd’hui : 81, STADE.");
    // 81 is not provisional any more (5 counted), so no provisional line.
    expect(out.lines).toEqual([]);
  });

  it("tier: the tier word, the number and the journée", () => {
    const { c, hero } = heroOf("tierUp");
    const out = heroText(hero!, c, fr);
    expect(text(out.label)).toBe("Votre carte passe CHAMPION.");
    expect(out.lines.map(text)).toEqual([
      "88 OVR après la J12. Le palier suit votre note, journée après journée.",
    ]);
    expect(out.primary).toBe("Voir ma carte");
  });

  it("founder: « Fondateur 2026 », the name after the sentence, the year mark and the cut-off date", () => {
    const { c, hero } = heroOf("founder");
    const out = heroText(hero!, c, fr);
    expect(text(out.label)).toBe("Fondateur 2026");
    expect(out.lines.map(text)).toEqual([
      "Votre année s’inscrit après votre nom : Ali ·26. Cette marque a été accordée une seule fois et ne le sera plus.",
      "Accordée aux équipes 2026/27 créées avant le 30 novembre 2026.",
    ]);
    // The mark is isolated, left to right.
    expect(html(out.lines[0])).toContain('<bdi dir="ltr">·26</bdi>');
  });

  it("season closed: the season, the number and the tier", () => {
    const { c, hero } = heroOf("seasonClosed");
    const out = heroText(hero!, c, fr);
    expect(text(out.label)).toBe("Fin de saison");
    expect(out.lines.map(text)).toEqual([
      "Saison 2026/27 terminée : 86, PRO. Elle reste sur votre carte.",
    ]);
  });
});

describe("the heroes' sentences (Arabic)", () => {
  const ar = words("ar");

  it("every number is isolated left to right", () => {
    const { c, hero } = heroOf("rated");
    const out = heroText(hero!, c, ar);
    expect(html(out.label)).toContain('<bdi dir="ltr">7</bdi>');
    expect(html(out.lines[0])).toContain("5");
    const tier = heroText(heroOf("tierUp").hero!, card("tierUp"), ar);
    expect(html(tier.lines[0])).toContain('<bdi dir="ltr">88</bdi>');
    expect(html(tier.lines[0])).toContain('<bdi dir="ltr">12</bdi>');
  });

  it("the founder's year mark is isolated even though the dictionary writes it in the sentence", () => {
    const out = heroText(heroOf("founder").hero!, card("founder"), ar);
    expect(html(out.lines[0])).toContain('<bdi dir="ltr">·26</bdi>');
    // The literal mark is not left behind in the running text.
    expect(html(out.lines[0]).replace(/<bdi dir="ltr">·26<\/bdi>/g, "")).not.toContain("·26");
    expect(text(out.lines[1])).toContain("2026");
  });

  it("the cut-off date has Latin digits", () => {
    expect(formatCutoff("2026-11-30", "ar")).toMatch(/30/);
    expect(formatCutoff("2026-11-30", "ar")).toMatch(/2026/);
    expect(formatCutoff("2026-11-30", "fr")).toBe("30 novembre 2026");
    expect(formatCutoff("nonsense", "fr")).toBe("");
  });

  it("the tier word is Arabic, as the lab", () => {
    const out = heroText(heroOf("tierUp").hero!, card("tierUp"), ar);
    expect(text(out.label)).toContain("بطل");
  });
});

describe("what a heading may hold", () => {
  it("no hero label carries the manager's name, in either language", () => {
    for (const lang of ["fr", "ar"] as const) {
      for (const id of [
        "rated",
        "launchArrival",
        "returning",
        "tierUp",
        "legend",
        "founder",
        "seasonClosed",
      ] as const) {
        const { c, hero } = heroOf(id);
        const label = text(heroText(hero!, c, words(lang)).label);
        expect(label).not.toContain(c.name);
      }
    }
  });

  it("·26 appears only for the founder", () => {
    for (const lang of ["fr", "ar"] as const) {
      for (const id of [
        "rated",
        "launchArrival",
        "returning",
        "tierUp",
        "legend",
        "seasonClosed",
      ] as const) {
        const { c, hero } = heroOf(id);
        const out = heroText(hero!, c, words(lang));
        expect([out.label, ...out.lines].map(text).join(" ")).not.toContain("·26");
      }
    }
    const founder = heroText(heroOf("founder").hero!, card("founder"), words("fr"));
    expect([founder.label, ...founder.lines].map(text).join(" ")).toContain("·26");
  });
});

describe("the born panel's sentences", () => {
  const future = new Date(Date.now() + 38 * 3_600_000).toISOString();
  const past = new Date(Date.now() - 3_600_000).toISOString();

  it("leads with the serial when it exists, then when the rating comes, then what it measures", () => {
    const born = bornText(card("born0Serial"), words("fr"), future);
    expect(born.lines.map((line) => text(line.text))).toEqual([
      "Son numéro, BOT #482913, ne changera jamais.",
      "Sa note arrive après 3 journées terminées : J14, J15, J16.",
      "Elle mesurera vos choix : capitaine, titulaires, transferts, régularité.",
    ]);
    // Belonging is the one strong line; the rules are quiet.
    expect(born.lines.map((line) => line.strong)).toEqual([true, false, false]);
    expect(born.lines.map((line) => line.kind)).toEqual(["serial", "timing", "measure"]);
    expect(text(born.invite)).toBe(
      "Invitez vos amis avant la date limite de la J14 : leurs journées compteront en même temps que les vôtres.",
    );
  });

  it("the team page's panel keeps the serial and the timing and drops what the rating measures", () => {
    const withSerial = compactBornLines(bornText(card("born0Serial"), words("fr"), future));
    expect(withSerial.map((line) => text(line.text))).toEqual([
      "Son numéro, BOT #482913, ne changera jamais.",
      "Sa note arrive après 3 journées terminées : J14, J15, J16.",
    ]);
    const without = compactBornLines(bornText(card("born0"), words("fr"), future));
    expect(without.map((line) => line.kind)).toEqual(["timing"]);
    // An existing manager's arrival sentence is one line already and stays whole.
    expect(
      compactBornLines(bornText(card("forming1"), words("ar"), future)).map((line) => line.kind),
    ).toEqual(["timing"]);
  });

  it("no serial sentence while the serial is null, and the timing leads", () => {
    const born = bornText(card("born0"), words("fr"), future);
    expect(born.lines.map((line) => text(line.text)).join(" ")).not.toContain("BOT");
    expect(born.lines.map((line) => line.strong)).toEqual([true, false]);
  });

  it("no invitation once the first deadline has passed, or when it is not known", () => {
    expect(bornText(card("born0"), words("fr"), past).invite).toBeNull();
    expect(bornText(card("born0"), words("fr"), null).invite).toBeNull();
  });

  it("when the rounds cannot all be listed, it says « à partir de la J5 »", () => {
    const partial: MyCardDto = {
      ...card("born0"),
      ratingGameweeksComplete: false,
      ratingGameweeks: [5],
    };
    expect(text(bornText(partial, words("fr"), future).lines[0]!.text)).toBe(
      "Sa note arrive après 3 journées terminées, à partir de la J5.",
    );
  });

  it("an existing manager below the minimum gets the arrival sentence, with k/n as one figure", () => {
    const arrival: MyCardDto = { ...card("forming1") };
    const fr = bornText(arrival, words("fr"), future);
    expect(fr.lines).toHaveLength(1);
    expect(text(fr.lines[0]!.text)).toBe(
      "Nouveau : votre carte est calculée à partir de votre équipe. Sa note arrive après 3 journées terminées (1/3).",
    );
    expect(fr.invite).toBeNull();
    const ar = bornText(arrival, words("ar"), future);
    expect(html(ar.lines[0]!.text)).toContain('<bdi dir="ltr">1/3</bdi>');
  });

  it("Arabic: the serial is isolated, the rounds are the plural family's", () => {
    const born = bornText(card("born0Serial"), words("ar"), future);
    expect(html(born.lines[0]!.text)).toContain('<bdi dir="ltr">BOT #482913</bdi>');
    expect(text(born.lines[1]!.text)).toContain("جولات");
  });
});

describe("the one-line states", () => {
  it("the cleared label says the number and the journées that cleared it", () => {
    expect(text(lineText("provisional_cleared", card("cleared"), words("fr")))).toBe(
      "Votre note n’est plus provisoire : 85 après 5 journées terminées.",
    );
  });

  it("the new season keeps last season's number", () => {
    expect(text(lineText("season_started", card("seasonStarted"), words("fr")))).toBe(
      "Saison 2027/28 : votre carte garde sa note 86 jusqu’à votre première note de la saison, après 3 journées terminées.",
    );
  });

  it("a fall is stated plainly", () => {
    expect(text(lineText("tier_down", card("tierDown"), words("fr")))).toBe(
      "Palier actuel : STADE. Meilleur cette saison : PRO.",
    );
  });

  it("nothing to say is null, never a half sentence", () => {
    expect(lineText("tier_down", card("rated"), words("fr"))).not.toBeNull();
    expect(lineText("season_started", card("rated"), words("fr"))).toBeNull();
    expect(lineText("provisional_cleared", card("born0"), words("fr"))).toBeNull();
  });
});

describe("the replay's sentences", () => {
  it("says what it was and what it is now", () => {
    const c = card("returning");
    const items = deriveReplayItems(c, FIXTURES.returning.history);
    const first = items.find((item) => item.kind === "first_rating")!;
    const view = replayView(first, c, words("fr"));
    expect(text(view.title)).toBe("La première note · J3");
    expect(view.lines.map(text)).toEqual(["À la J3 : 84. Aujourd’hui : 81."]);
    expect(view.profile.ovr).toBe(84);
    expect(view.profile.tier).toBe("pro");
  });

  it("the founder's replay is drawn from the card and keeps the mark", () => {
    const c = card("founder");
    const item = deriveReplayItems(c, FIXTURES.founder.history).find(
      (entry) => entry.kind === "founder",
    )!;
    const view = replayView(item, c, words("fr"));
    expect(text(view.title)).toBe("Fondateur 2026");
    expect(view.profile.founder).toBe(2026);
  });

  it("a closed season is told from its last stored journée", () => {
    const c = card("seasonClosed");
    const item = deriveReplayItems(c, FIXTURES.seasonClosed.history).find(
      (entry) => entry.kind === "season",
    )!;
    const view = replayView(item, c, words("fr"));
    expect(text(view.title)).toBe("Saison 2026/27");
    expect(text(view.lines[0])).toContain("terminée");
  });

  it("Arabic: the journée and the numbers are isolated", () => {
    const c = card("returning");
    const first = deriveReplayItems(c, FIXTURES.returning.history).find(
      (item) => item.kind === "first_rating",
    )!;
    const view = replayView(first, c, words("ar"));
    expect(html(view.lines[0])).toContain('<bdi dir="ltr">84</bdi>');
    expect(html(view.lines[0])).toContain('<bdi dir="ltr">3</bdi>');
  });
});
