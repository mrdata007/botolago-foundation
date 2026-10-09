import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { auto, fill, fillText, isArabicTemplate, isolateText, ltr } from "./interpolate";

const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const markup = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("fill (the interface)", () => {
  it("fills a French template with plain text, no element", () => {
    expect(fill("J{gw} · date limite {deadline}", { gw: 8, deadline: "sam. 16:30" })).toBe(
      "J8 · date limite sam. 16:30",
    );
  });

  it("isolates a number in an Arabic template in <bdi dir=ltr>", () => {
    expect(
      markup(fill("الجولة {gw} · الموعد النهائي {deadline}", { gw: 8, deadline: "السبت" })),
    ).toBe('الجولة <bdi dir="ltr">8</bdi> · الموعد النهائي السبت');
  });

  it("isolates a number-like string (a season, a time) and leaves names and phrases alone", () => {
    expect(markup(fill("موسم {season}", { season: "2026/27" }))).toBe(
      'موسم <bdi dir="ltr">2026/27</bdi>',
    );
    expect(markup(fill("أنت {a} · {name} {b}", { a: 84, name: "Karim 2", b: "78" }))).toBe(
      'أنت <bdi dir="ltr">84</bdi> · Karim 2 <bdi dir="ltr">78</bdi>',
    );
  });

  it("takes elements as values, and the helpers for names and codes", () => {
    expect(
      markup(fill("« {league} » {code}", { league: auto("Les Lions"), code: ltr("A1") })),
    ).toBe('« <bdi dir="auto">Les Lions</bdi> » <bdi dir="ltr">A1</bdi>');
  });

  it("leaves a placeholder with no value as it is", () => {
    expect(fill("Vous {a} · {name}", { a: 3 })).toBe("Vous 3 · {name}");
  });

  it("isolates a fraction whole: {k}/{n} is one left-to-right run, never « 3/1 » in Arabic", () => {
    expect(markup(fill("قيد التكوين {k}/{n}", { k: 1, n: 3 }))).toBe(
      'قيد التكوين <bdi dir="ltr">1/3</bdi>',
    );
    // inside a sentence, with another number beside it
    expect(markup(fill("بعد {final} ({k}/{n}).", { final: "3 جولات", k: 2, n: 3 }))).toBe(
      'بعد 3 جولات (<bdi dir="ltr">2/3</bdi>).',
    );
    // whole numbers given as strings
    expect(markup(fill("{k}/{n}", { k: "2", n: "3" }))).toBe("2/3");
    expect(markup(fill("جولة {k}/{n}", { k: "2", n: "3" }))).toBe('جولة <bdi dir="ltr">2/3</bdi>');
  });

  it("a ready-made {kn} fraction gives the same markup as {k}/{n}", () => {
    const merged = markup(fill("قيد التكوين {k}/{n}", { k: 1, n: 3 }));
    expect(markup(fill("قيد التكوين {kn}", { kn: "1/3" }))).toBe(merged);
    expect(markup(fill("قيد التكوين {kn}", { kn: ltr("1/3") }))).toBe(merged);
    // the callers that merge by hand (`{k}/{n}` replaced by `{kn}`) keep working
    expect(markup(fill("قيد التكوين {k}/{n}".replace("{k}/{n}", "{kn}"), { kn: "1/3" }))).toBe(
      merged,
    );
  });

  it("leaves French fractions as plain text, and a slash between other things alone", () => {
    expect(fill("en formation {k}/{n}", { k: 1, n: 3 })).toBe("en formation 1/3");
    // one value is not a whole number: no fraction, each placeholder on its own
    expect(markup(fill("{a}/{b} ·", { a: "Raja", b: 3 }))).toBe("Raja/3 ·");
    expect(markup(fill("جولة {a}/{b}", { a: "x", b: 3 }))).toBe('جولة x/<bdi dir="ltr">3</bdi>');
    // a fraction with a missing value stays visible for review
    expect(fill("{k}/{n}", { k: 1 })).toBe("1/{n}");
  });

  it("repeats a placeholder", () => {
    expect(fill("{n} / {n}", { n: 2 })).toBe("2 / 2");
  });
});

describe("fillText (messages, labels, the picture)", () => {
  it("fills French as it is", () => {
    expect(
      fillText("Ma carte BotolaGO : {ovr}. Et toi ? {link}", { ovr: 84, link: "https://x.y/a1" }),
    ).toBe("Ma carte BotolaGO : 84. Et toi ? https://x.y/a1");
  });

  it("wraps Arabic numbers in U+2068 … U+2069, never a link or a name", () => {
    const text = fillText("بطاقتي في BotolaGO: {ovr}. وأنت؟ انضمّ إلى دوريي « {league} »: {link}", {
      ovr: 84,
      league: "Lions 2026",
      link: "https://botolago.com/jouer?c=a1b2",
    });
    expect(text).toBe(
      `بطاقتي في BotolaGO: ${FSI}84${PDI}. وأنت؟ انضمّ إلى دوريي « Lions 2026 »: https://botolago.com/jouer?c=a1b2`,
    );
  });

  it("wraps a fraction whole: « 1/3 » is one run in Arabic text", () => {
    expect(fillText("قيد التكوين {k}/{n}", { k: 1, n: 3 })).toBe(`قيد التكوين ${FSI}1/3${PDI}`);
    expect(fillText("en formation {k}/{n}", { k: 1, n: 3 })).toBe("en formation 1/3");
    expect(fillText("قيد التكوين {kn}", { kn: "1/3" })).toBe(`قيد التكوين ${FSI}1/3${PDI}`);
  });

  it("wraps a number-like string and a plain number alike", () => {
    expect(fillText("الجولة {gw}: {ovr}", { gw: "5", ovr: 84 })).toBe(
      `الجولة ${FSI}5${PDI}: ${FSI}84${PDI}`,
    );
  });
});

describe("helpers", () => {
  it("knows an Arabic template, and isolates text on demand", () => {
    expect(isArabicTemplate("الجولة {gw}")).toBe(true);
    expect(isArabicTemplate("J{gw}")).toBe(false);
    expect(isolateText("Karim")).toBe(`${FSI}Karim${PDI}`);
  });
});

describe("the dictionary's fractions", () => {
  it("every Arabic value with {k}/{n} fills to one isolated run, with no manual merge", async () => {
    const { dictionaries } = await import("@/i18n/dictionaries");
    const keys = Object.keys(dictionaries.ar).filter((key) =>
      dictionaries.ar[key as keyof typeof dictionaries.ar].includes("{k}/{n}"),
    );
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (const key of keys) {
      const html = markup(
        fill(dictionaries.ar[key as keyof typeof dictionaries.ar], { k: 1, n: 3, final: "x" }),
      );
      expect(html, key).toContain('<bdi dir="ltr">1/3</bdi>');
      expect(html, key).not.toContain("</bdi>/<bdi");
    }
  });
});
