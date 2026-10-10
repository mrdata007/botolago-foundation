import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

import {
  CARD_STAT_TOTAL,
  OVR_MIN_STATS,
  cardCopy,
  cardLabel,
  cardStrings,
  countedA11y,
  countedRounds,
  finalRounds,
  curvaCopy,
  filledStats,
  gwList,
  isolateLatin,
  leagues,
  momentCopy,
  pluralCategory,
  rounds,
  statReasonText,
  type Translate,
} from "./copy";
import { fromMyCard } from "./to-profile";
import { FIXTURES } from "@/backend/manager-card/fixtures";

const tFor =
  (lang: Language): Translate =>
  (key: TranslationKey) =>
    (dictionaries[lang] as Record<string, string>)[key] ?? key;
const fr = tFor("fr");
const ar = tFor("ar");
// The isolates `fillText` puts round Arabic digits (U+2068 and U+2069).
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const bare = (text: string) => text.replaceAll(FSI, "").replaceAll(PDI, "");

const ROOT = join(import.meta.dir, "..", "..", "..");

describe("plural categories", () => {
  it("French: one for 1, two for 2, the rest other; zero only where a family has it", () => {
    expect([0, 1, 2, 3, 5, 11, 100].map((n) => pluralCategory(n, "fr"))).toEqual([
      "other",
      "one",
      "two",
      "other",
      "other",
      "other",
      "other",
    ]);
    expect(pluralCategory(0, "fr", true)).toBe("zero");
  });

  it("Arabic: the CLDR categories, with 'many' read as 'other'", () => {
    expect([0, 1, 2, 3, 5, 10, 11, 99, 100, 102, 103].map((n) => pluralCategory(n, "ar"))).toEqual([
      "other",
      "one",
      "two",
      "few",
      "few",
      "few",
      "other",
      "other",
      "other",
      "other",
      "few",
    ]);
    expect(pluralCategory(0, "ar", true)).toBe("zero");
  });
});

describe("the plural families, for 0, 1, 2, 3, 5, 11 and 100", () => {
  const counts = [0, 1, 2, 3, 5, 11, 100];

  it("finalRounds: « 3 journées terminées » / «3 جولات منتهية»", () => {
    expect(counts.map((n) => finalRounds(n, "fr", fr))).toEqual([
      "0 journées terminées",
      "1 journée terminée",
      "2 journées terminées",
      "3 journées terminées",
      "5 journées terminées",
      "11 journées terminées",
      "100 journées terminées",
    ]);
    expect(counts.map((n) => bare(finalRounds(n, "ar", ar)))).toEqual([
      "0 جولة منتهية",
      "جولة واحدة منتهية",
      "جولتين منتهيتين",
      "3 جولات منتهية",
      "5 جولات منتهية",
      "11 جولة منتهية",
      "100 جولة منتهية",
    ]);
  });

  it("rounds: « 3 journées » / «3 جولات»", () => {
    expect(counts.map((n) => rounds(n, "fr", fr))).toEqual([
      "0 journées",
      "1 journée",
      "2 journées",
      "3 journées",
      "5 journées",
      "11 journées",
      "100 journées",
    ]);
    expect(counts.map((n) => bare(rounds(n, "ar", ar)))).toEqual([
      "0 جولة",
      "جولة واحدة",
      "جولتين",
      "3 جولات",
      "5 جولات",
      "11 جولة",
      "100 جولة",
    ]);
  });

  it("countedRounds has a zero form", () => {
    expect(counts.map((n) => countedRounds(n, "fr", fr))).toEqual([
      "Aucune journée comptée",
      "1 journée comptée",
      "2 journées comptées",
      "3 journées comptées",
      "5 journées comptées",
      "11 journées comptées",
      "100 journées comptées",
    ]);
    expect(counts.map((n) => bare(countedRounds(n, "ar", ar)))).toEqual([
      "لا جولات محتسبة بعد",
      "جولة واحدة محتسبة",
      "جولتان محتسبتان",
      "3 جولات محتسبة",
      "5 جولات محتسبة",
      "11 جولة محتسبة",
      "100 جولة محتسبة",
    ]);
  });

  it("countedA11y says how far a card has got, with a zero form, bare for a screen reader", () => {
    expect(counts.map((n) => countedA11y(n, 3, "fr", fr, false))).toEqual([
      "aucune journée comptée sur 3",
      "1 journée comptée sur 3",
      "2 journées comptées sur 3",
      "3 journées comptées sur 3",
      "5 journées comptées sur 3",
      "11 journées comptées sur 3",
      "100 journées comptées sur 3",
    ]);
    expect(countedA11y(2, 3, "ar", ar, false)).toBe("جولتان محتسبتان من 3");
    expect(countedA11y(2, 3, "ar", ar, false)).not.toContain(FSI);
    expect(countedA11y(2, 3, "ar", ar)).toContain(FSI);
  });

  it("leagues: « 1 ligue », « 2 ligues », «دوريان»", () => {
    expect([1, 2, 3, 11].map((n) => leagues(n, "fr", fr))).toEqual([
      "1 ligue",
      "2 ligues",
      "3 ligues",
      "11 ligues",
    ]);
    expect([1, 2, 3, 11].map((n) => bare(leagues(n, "ar", ar)))).toEqual([
      "دوري واحد",
      "دوريان",
      "3 دوريات",
      "11 دوريًا",
    ]);
  });

  it("isolates the digits of Arabic text, and only Arabic text", () => {
    expect(finalRounds(3, "ar", ar)).toBe(`${FSI}3${PDI} جولات منتهية`);
    expect(finalRounds(3, "fr", fr)).not.toContain(FSI);
  });
});

describe("gwList", () => {
  it("lists up to three journées, and has no list beyond", () => {
    expect(gwList([5], "fr", fr)).toBe("J5");
    expect(gwList([5, 6], "fr", fr)).toBe("J5, J6");
    expect(gwList([5, 6, 7], "fr", fr)).toBe("J5, J6, J7");
    expect(bare(gwList([5, 6, 7], "ar", ar)!)).toBe("الجولات 5 و6 و7");
    expect(bare(gwList([5, 6], "ar", ar)!)).toBe("الجولتان 5 و6");
    expect(gwList([5, 6, 7, 8], "fr", fr)).toBeNull();
    expect(gwList([], "fr", fr)).toBeNull();
  });
});

describe("statReasonText", () => {
  it("has a line for every reason the server can give", () => {
    expect(statReasonText("pending_minimum", "fr", fr, 3)).toBe("pas encore assez de journées");
    expect(statReasonText("no_transfers", "fr", fr, 3)).toBe("pas encore de transfert");
    expect(statReasonText("window_open", "fr", fr, 3)).toBe(
      "calculé 3 journées après le transfert",
    );
    expect(bare(statReasonText("window_open", "ar", ar, 3))).toBe("يُحسب بعد 3 جولات من الانتقال");
    expect(statReasonText("excluded_weeks_only", "fr", fr, 3)).toBe("semaines non comptées");
    expect(statReasonText("board_not_final", "fr", fr, 3)).toBe("classement pas encore définitif");
    expect(statReasonText("pre_captain_fix", "ar", ar, 3)).toBe(
      "جولات القائد المعيَّن تلقائيًا غير محتسبة",
    );
  });
});

describe("cardStrings and cardLabel", () => {
  it("hands a renderer every word it may print or speak", () => {
    const strings = cardStrings(fr, "fr");
    expect(strings.lang).toBe("fr");
    expect(strings.ovr).toBe("OVR");
    expect(strings.stats).toEqual({ cap: "CAP", sel: "SEL", trf: "TRF", con: "CON" });
    expect(strings.tiers).toEqual({
      homa: "LASTREET",
      stade: "STADE",
      pro: "PRO",
      champion: "CHAMPION",
      legend: "LEGEND",
    });
    expect(strings.serial("482913")).toBe("BOT #482913");
    expect(strings.sample).toBe("Exemple");
    expect(strings.founderLine).toBe("Fondateur 2026");
    expect(strings.a11y.separator).toBe(", ");
    const arabic = cardStrings(ar, "ar");
    expect(arabic.tiers.pro).toBe("محترف");
    // The lowest tier reads LASTREET in both languages: a Latin word in the Arabic UI too.
    expect(arabic.tiers.homa).toBe("LASTREET");
    expect(arabic.a11y.separator).toBe("، ");
    expect(arabic.serial("482913")).toBe("BOT #482913");
    expect(arabic.sample).toBe("مثال");
  });

  it("names a rated card in one sentence", () => {
    const profile = fromMyCard(FIXTURES.founder.card!, { sample: true });
    expect(cardLabel(profile, cardStrings(fr, "fr"))).toBe(
      "Carte de manager, Ali, 84 OVR, PRO, Raja CA, Fondateur 2026, BOT #482913, Exemple",
    );
    expect(cardLabel(profile, cardStrings(ar, "ar"))).toBe(
      "بطاقة المدرّب، Ali، 84 OVR، محترف، الرجاء الرياضي، عضو مؤسس 2026، BOT #482913، مثال",
    );
  });

  it("says a card has no rating yet, and how far it has got, never 0", () => {
    const strings = cardStrings(fr, "fr");
    const forming = fromMyCard(FIXTURES.forming1.card!, { sample: false });
    expect(cardLabel(forming, strings)).toBe(
      "Carte de manager, Ali, pas encore de note, 1 journée comptée sur 3, Raja CA, BOT #482913",
    );
    expect(cardLabel(forming, cardStrings(ar, "ar"))).toContain("لا تقييم بعد");
    const unnamed = { ...forming, name: "  ", club: null, serial: null, counted: null };
    expect(cardLabel(unnamed, strings)).toBe("Carte de manager, pas encore de note");
    expect(cardLabel(forming, strings)).not.toMatch(/\b0\b/);
  });

  it("says how many statistics are filled once every journée is counted, never « 3 sur 3 »", () => {
    const waiting = fromMyCard(FIXTURES.insufficient3.card!, { sample: false });
    expect(cardLabel(waiting, cardStrings(fr, "fr"))).toBe(
      "Carte de manager, Ali, pas encore de note, Statistiques remplies : 2 sur 4, Raja CA, BOT #482913",
    );
    const arLabel = cardLabel(waiting, cardStrings(ar, "ar"));
    expect(arLabel).toContain("الإحصاءات المكتملة: 2 من 4");
    expect(arLabel).not.toContain("⁨");
    // A renderer's own strings without the sentence keep the journée count.
    const { statsFilled: _omit, ...bare } = cardStrings(fr, "fr").a11y;
    void _omit;
    expect(cardLabel(waiting, { ...cardStrings(fr, "fr"), a11y: bare })).toContain(
      "3 journées comptées sur 3",
    );
  });

  it("puts the statistics rule in one place: 3 of the 4 (the SQL's « null under three »)", () => {
    expect(OVR_MIN_STATS).toBe(3);
    expect(CARD_STAT_TOTAL).toBe(4);
    expect(filledStats([91, 82, null, null])).toBe(2);
    expect(filledStats([null, null, null, null])).toBe(0);
    const sql = readFileSync(
      join(ROOT, "supabase/migrations/20261008123200_manager_card_compute.sql"),
      "utf8",
    );
    expect(sql).toContain("(s.con is not null)::integer >= 3");
  });

  it("words the wait for a statistic from the rule, in both languages", () => {
    const fill = (template: string) =>
      template.replace("{need}", String(OVR_MIN_STATS)).replace("{total}", String(CARD_STAT_TOTAL));
    expect(fill(momentCopy(fr).m3.insufficient)).toBe(
      "Votre note s’affiche dès que 3 statistiques sur 4 sont remplies.",
    );
    expect(fill(momentCopy(ar).m3.insufficient)).toBe("يظهر تقييمك فور اكتمال 3 إحصاءات من 4.");
    expect(cardCopy(fr, "fr").statsFilled).toBe("Statistiques remplies");
    expect(cardCopy(ar, "ar").statsFilled).toBe("الإحصاءات المكتملة");
  });
});

describe("isolateLatin (LASTREET in text that leaves the interface)", () => {
  const LRI = String.fromCodePoint(0x2066);
  const PDI = String.fromCodePoint(0x2069);

  it("wraps a Latin word in a left-to-right isolate in Arabic, and only there", () => {
    expect(isolateLatin("LASTREET", "ar")).toBe(`${LRI}LASTREET${PDI}`);
    expect(isolateLatin("LASTREET", "fr")).toBe("LASTREET");
  });

  it("leaves an Arabic word, an empty string and the other tiers' Arabic words alone", () => {
    expect(isolateLatin("محترف", "ar")).toBe("محترف");
    expect(isolateLatin("", "ar")).toBe("");
    for (const tier of ["stade", "pro", "champion", "legend"] as const) {
      const word = cardStrings(ar, "ar").tiers[tier];
      expect(isolateLatin(word, "ar")).toBe(word);
    }
  });

  it("is what the tier word becomes in a plain sentence: the isolates sit round it, not round the sentence", () => {
    const strings = cardStrings(ar, "ar");
    const sentence = `63 OVR · ${isolateLatin(strings.tiers.homa, "ar")}`;
    expect(sentence).toContain(`${LRI}LASTREET${PDI}`);
    expect(sentence.startsWith("63")).toBe(true);
  });

  it("is not in a card's accessible label, which is spoken and keeps the bare word", () => {
    const homa = fromMyCard(FIXTURES.homa.card!, { sample: false });
    const label = cardLabel(homa, cardStrings(ar, "ar"));
    expect(label).toContain("LASTREET");
    expect(label).not.toContain(LRI);
    expect(label).not.toContain(PDI);
  });
});

describe("the dictionary of the section", () => {
  const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
  const sectionKeys = (Object.keys(dictionaries.fr) as TranslationKey[]).filter(
    (key) =>
      key === "nav.curva" ||
      key.startsWith("curva.") ||
      key.startsWith("card.") ||
      key === "fantasy.hub.pepites_body" ||
      key === "fantasy.hub.card_view",
  );

  // 184: Appendix A's 183 and « Vos moments » (finish review). 187: the waiting box's
  // « Statistiques remplies » title and its accessible sentence, and the league row's
  // « statistiques remplies 2/4 » (the card that waits for a statistic, 2026-10-10).
  it("has the 187 keys of Appendix A (183, « Vos moments », and the three of the statistics wait), in both languages", () => {
    expect(sectionKeys).toHaveLength(187);
    for (const key of sectionKeys) {
      expect(dictionaries.ar[key as keyof typeof dictionaries.ar]).toBeDefined();
    }
  });

  it("is read in copy.ts by literal calls, every key once or more and none built", () => {
    const source = read("src/components/manager-card/copy.ts");
    const used = new Set([...source.matchAll(/\bt\("([^"]+)"\)/g)].map((match) => match[1]));
    expect(sectionKeys.filter((key) => !used.has(key))).toEqual([]);
    expect(source.match(/\bt\((?!")/g)).toBeNull();
  });

  it("every accessor reads the key its property is named for", () => {
    const g = curvaCopy(fr, "fr");
    expect(g.nav).toBe("Curva");
    expect(g.guestHeadline).toBe("Votre place dans la Curva");
    expect(g.guestPointRatingBody).toContain("{final}");
    expect(g.shareCaption).toBe("Ma carte BotolaGO");
    expect(g.hubPepitesBody).toContain("moins de 23 ans");
    expect(g.leagues(2)).toBe("2 ligues");
    const c = cardCopy(ar, "ar");
    expect(c.founderLine).toBe("عضو مؤسس 2026");
    expect(c.finalRounds(1)).toBe("جولة واحدة منتهية");
    expect(c.stat.cap).toBe("القائد");
    expect(c.reason.windowOpen).toContain("{rounds}");
    const m = momentCopy(fr);
    expect(m.m1.introBody).toContain("{final}");
    expect(m.m9.heading).toBe("Fondateur 2026");
    expect(m.state.offlineText).toBe("Impossible de charger votre carte.");
    expect(m.m6.msgPlainProvisional).toContain("(provisoire)");
  });

  it("keeps the motion words out of the Appendix A pin, and reads them in motion-copy.ts by literal calls", () => {
    expect(sectionKeys.some((key) => key.startsWith("card_motion."))).toBe(false);
    const source = read("src/components/manager-card/motion-copy.ts");
    const used = new Set([...source.matchAll(/\bt\("([^"]+)"\)/g)].map((match) => match[1]));
    const motionKeys = Object.keys(dictionaries.fr).filter((key) => key.startsWith("card_motion."));
    expect(motionKeys.length).toBeGreaterThan(0);
    expect(motionKeys.filter((key) => !used.has(key))).toEqual([]);
  });

  it("keeps the same placeholders in both languages", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of sectionKeys) {
      expect(placeholders(dictionaries.ar[key as keyof typeof dictionaries.ar])).toEqual(
        placeholders(dictionaries.fr[key]),
      );
    }
  });
});

/** Plan 2.5: the words the section never uses, in either language. */
describe("the banned words", () => {
  const BANNED = [
    /\bpull\b/i,
    /\bpack\b/i,
    /level up/i,
    /monter de niveau/i,
    /débloqu/i,
    /tirage/i,
    /révélation/i,
    /officiel/i,
    /signature/i,
    /exclusi/i,
    /\brare\b/i,
    /\blimité/i,
    /édition/i,
    /\bVIP\b/,
    /dernière chance/i,
    /\bvite\b/i,
    /collectionn/i,
    /gagner/i,
    /classement des cartes/i,
    /meilleure carte/i,
    /رسمي/,
    /توقيع/,
    /محدود/,
    /حصري/,
    /نادر/,
    /تحصيل/,
  ];
  const keys = (Object.keys(dictionaries.fr) as TranslationKey[]).filter(
    (key) =>
      key === "nav.curva" ||
      key.startsWith("curva.") ||
      key.startsWith("card.") ||
      // the motion words (`motion-copy.ts`) are held to the same voice, though they are not in the
      // pinned Appendix A set above
      key.startsWith("card_motion."),
  );

  it.each(["fr", "ar"] as const)("none in a %s string", (lang) => {
    const hits = keys.flatMap((key) =>
      BANNED.filter((word) => word.test((dictionaries[lang] as Record<string, string>)[key]!)).map(
        (word) => `${key}: ${word}`,
      ),
    );
    expect(hits).toEqual([]);
  });

  it("no string counts managers, founders, supporters or ratings", () => {
    const counts = /\b\d+\s*(managers?|fondateurs?|supporters?|membres?|cartes?)\b/i;
    expect(keys.filter((key) => counts.test(dictionaries.fr[key]))).toEqual([]);
  });

  it("'tu' appears only in the messages the manager sends", () => {
    const tu = /\b(tu|ta|ton|tes|toi)\b/i;
    expect(
      keys.filter((key) => tu.test(dictionaries.fr[key]) && !key.includes(".m6.msg.")),
    ).toEqual([]);
  });
});
