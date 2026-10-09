import { describe, expect, it } from "bun:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TIER_KEYS } from "./foil";
import { RING, TAB, WINDOW, WINDOW_IN } from "./geometry";
import { eclatRenderer } from "./index";
import { FR, AR, MOCK_ARABIC, MOCK_CARDS, PROFILES } from "./test-data";
import { elementsByClass, layer, tokenise, texts } from "./test-markup";
import type { CardProfile } from "../types";

const draw = (p: CardProfile, o: { compact?: boolean; lang?: "fr" | "ar" } = {}) =>
  eclatRenderer.full(p, { strings: o.lang === "ar" ? AR : FR, theme: "light", compact: o.compact });

describe("the layer stack (plan 3.2, 8.1)", () => {
  const html = draw(MOCK_CARDS[5]!.profile);

  it("stacks five layers and seven rims in z order, under one root, with the foil overlay on top", () => {
    const order = [...html.matchAll(/<svg class="mc-l ([^"]*)"/g)].map((m) =>
      m[1]!.replace(/mc-l--/, ""),
    );
    expect(order).toEqual(["base", ...Array(7).fill("mc-rim"), "shirt", "num", "frame", "holo"]);
    expect(html.indexOf('class="mc-eclat__foil"')).toBeGreaterThan(
      html.lastIndexOf('<svg class="mc-l mc-l--holo"'),
    );
    expect(html.indexOf("mc-eclat__shadow")).toBeLessThan(html.indexOf("mc-eclat__persp"));
    // the rims walk from the darkest at the back (k 1) to the lightest next to the face (k 7)
    const rims = [...html.matchAll(/style="--k:(\d);--o:(\d)"[^>]*>.*?fill="(#[0-9a-f]{6})"/g)];
    expect(rims.map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const lum = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    for (let i = 1; i < rims.length; i++)
      expect(lum(rims[i]![3]!)).toBeGreaterThan(lum(rims[i - 1]![3]!));
    for (const m of rims) expect(m[2]).toBe(String(8 - Number(m[1])));
    expect(html.includes(`d="${RING}"`)).toBe(true);
  });

  it("takes no pointer but the number's: the number layer holds the only hit target", () => {
    for (const name of ["base", "shirt", "frame", "holo"]) {
      expect(layer(html, name)!.includes("data-mc="), name).toBe(false);
    }
    expect(layer(html, "num")!.match(/data-mc="ovr"/g)).toHaveLength(1);
    const css = readFileSync(join(import.meta.dir, "eclat.css"), "utf8");
    expect(css).toMatch(/\.mc-l\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\.mc-l--num \[data-mc="ovr"\]\s*\{\s*pointer-events:\s*auto/);
    expect(css).toMatch(/\.mc-eclat__foil\s*\{[^}]*pointer-events:\s*none/);
  });

  it("keeps the 3D ancestors free of what flattens them", () => {
    const tags = tokenise(html);
    for (const cls of ["mc-eclat", "mc-eclat__persp", "mc-eclat__tilt"]) {
      const t = tags.find(
        (x) => x.name === "div" && (x.attrs.class ?? "").split(/\s+/).includes(cls),
      )!;
      expect(t, cls).toBeDefined();
      const style = t.attrs.style ?? "";
      expect(/filter|opacity|clip-path|mask|mix-blend|isolation|overflow/.test(style), cls).toBe(
        false,
      );
    }
    const css = readFileSync(join(import.meta.dir, "eclat.css"), "utf8");
    const rule = (sel: string) =>
      new RegExp(`${sel.replace(/[.[\]="]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
    for (const sel of [".mc-eclat", ".mc-eclat__persp", ".mc-eclat__tilt"]) {
      for (const m of css.matchAll(rule(sel))) {
        expect(
          /\b(filter|opacity|clip-path|mask|mix-blend-mode|isolation|overflow)\s*:/.test(m[1]!),
          sel,
        ).toBe(false);
      }
    }
  });

  it("is flat at rest: the stylesheet gives the tree no transform until a pointer moves", () => {
    const css = readFileSync(join(import.meta.dir, "eclat.css"), "utf8");
    expect(css).toMatch(/\.mc-eclat__tilt\s*\{\s*transform:\s*none/);
    expect(css).toContain(
      ":is(.mc-eclat--active, .mc-eclat--idle, .mc-eclat--settle) .mc-eclat__tilt",
    );
    expect(css).toContain("transform-style: preserve-3d");
    // reduced motion never mounts the tilt (ManagerCard guards it); every keyframe sits in no-preference
    const beats = css.slice(css.indexOf("BEATS"));
    expect(beats).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(beats.match(/@keyframes/g)!.length).toBeGreaterThan(8);
    const outside = beats.slice(0, beats.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect(outside.includes("@keyframes")).toBe(false);
  });

  it("is one root for every tier and language, each layer an SVG of the same box", () => {
    for (const key of TIER_KEYS) {
      const p =
        key === "base"
          ? MOCK_CARDS[0]!.profile
          : MOCK_CARDS.find((c) => c.profile.tier === key)!.profile;
      for (const lang of ["fr", "ar"] as const) {
        const h = draw(p, { lang });
        expect((h.match(/viewBox="0 0 1000 1618"/g) ?? []).length, key).toBe(
          h.includes("mc-l--holo") ? 12 : 11,
        );
        expect(h.startsWith('<div class="mc-eclat '), key).toBe(true);
      }
    }
  });
});

describe("the face-à-face card (plan 7, G4: 136 to 200 px)", () => {
  it("drops the serial, the wordmark, « OVR », the season, the initials and the stat labels", () => {
    for (const c of [...MOCK_CARDS, ...MOCK_ARABIC]) {
      const h = draw(c.profile, { compact: true, lang: c.lang });
      const metas = texts(h)
        .map((t) => t.attrs["data-meta"])
        .filter(Boolean);
      for (const m of ["serial", "wordmark", "season", "initials", "founder-year"])
        expect(metas.includes(m), `${c.caption} ${m}`).toBe(false);
      expect(h.includes("data-ovrlabel")).toBe(false);
      expect(h.includes("data-label")).toBe(false);
      expect(h.includes("mc-eclat--compact")).toBe(true);
    }
  });

  it("sets every remaining text at 58 units or more, so 8 CSS px at 136 px wide", () => {
    const profiles: [CardProfile, "fr" | "ar"][] = [
      ...[...MOCK_CARDS, ...MOCK_ARABIC].map(
        (c) => [c.profile, c.lang] as [CardProfile, "fr" | "ar"],
      ),
      [{ ...MOCK_CARDS[3]!.profile, name: "Les Lions du Derb Sidi Maarouf" }, "fr"],
      [{ ...MOCK_CARDS[3]!.profile, name: "عبد الرحمن بن جلون العلوي" }, "ar"],
    ];
    for (const [p, lang] of profiles) {
      const h = draw(p, { compact: true, lang });
      const frame = layer(h, "frame")!;
      for (const t of texts(frame)) {
        expect(t.size, `${p.name} ${t.text}`).toBeGreaterThanOrEqual(58);
        expect((t.size * 136) / 1000).toBeGreaterThanOrEqual(7.8);
      }
    }
  });

  it("sets the forming marks at 72 × 28 and the founder capsule's star alone", () => {
    const forming = layer(draw(PROFILES.forming1, { compact: true }), "frame")!;
    expect(forming).toContain('width="72" height="28"');
    const founder = layer(draw(PROFILES.founder, { compact: true }), "frame")!;
    expect(founder).toContain("mc-capsule");
    expect(texts(founder).some((t) => t.text === "26")).toBe(false);
    expect(founder).toMatch(/data-meta="founder"><path d="M0 -16Q/);
  });

  it("holds the same layers, rims and number as the full card", () => {
    const h = draw(MOCK_CARDS[3]!.profile, { compact: true });
    expect(h.match(/<svg class="mc-l /g)).toHaveLength(12 - 1); // base, 7 rims, shirt, num, frame (no holo on PRO)
    expect(h.match(/data-mc="ovr"/g)).toHaveLength(1);
  });
});

describe("the frame's furniture", () => {
  it("gives LEGEND alone the foil plaque and the inner hairline shield", () => {
    for (const key of TIER_KEYS) {
      const p =
        key === "base"
          ? MOCK_CARDS[0]!.profile
          : MOCK_CARDS.find((c) => c.profile.tier === key)!.profile;
      const h = draw(p);
      expect(h.includes("-plq)"), key).toBe(key === "legend");
      expect(h.includes(`d="${WINDOW_IN}"`), key).toBe(key === "legend");
    }
  });

  it("puts a raised tab, the shield band and the outer edge in the tier's metal", () => {
    const frame = layer(draw(MOCK_CARDS[3]!.profile), "frame")!;
    expect(frame.includes(`d="${TAB}"`)).toBe(true);
    expect(frame.includes(`d="${WINDOW}"`)).toBe(true);
    expect(frame.includes("mc-spec-shift")).toBe(true);
    expect(frame.includes("-lipWL)") && frame.includes("-lipOD)")).toBe(true);
  });

  it("sets the tab's disc to the club's colours, the placeholder when there is none", () => {
    const withClub = layer(draw(MOCK_CARDS[3]!.profile), "frame")!;
    expect(withClub).toContain('cx="103" cy="134" r="54" fill="#0a8f3a"');
    const without = layer(draw(MOCK_CARDS[1]!.profile), "frame")!;
    expect(without).not.toContain('fill="#0a8f3a"');
    expect(elementsByClass(without, "g", "mc-capsule")).toHaveLength(0);
  });
});

describe("the depth, in the stylesheet (plan 8.2)", () => {
  const css = readFileSync(join(import.meta.dir, "eclat.css"), "utf8");
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  /** The declarations of every rule whose selector is exactly `sel`, joined. */
  const rule = (sel: string): string => {
    const re = new RegExp(
      `(?:^|[};])\\s*${sel.replace(/[.[\]*"=()|^$+?\\]/g, "\\$&")}\\s*\\{([^{}]*)\\}`,
      "gm",
    );
    const all = [...bare.matchAll(re)].map((m) => m[1]!.replace(/\s+/g, " ").trim());
    if (!all.length) throw new Error(`no rule for ${sel}`);
    return all.join(" ");
  };

  it("sets each layer at its depth: base 0, shirt 3, number 5, frame 8, holo 9, foil overlay 9.5, rims 1 to 7", () => {
    expect(rule(".mc-l--base")).toBe("--z: 0;");
    expect(rule(".mc-l--shirt")).toBe("--z: 3;");
    expect(rule(".mc-l--num")).toBe("--z: 5;");
    expect(rule(".mc-l--frame")).toBe("--z: 8;");
    expect(rule(".mc-l--holo")).toBe("--z: 9;");
    expect(rule(".mc-rim")).toContain("--z: var(--k);");
    expect(rule(".mc-eclat__foil")).toContain("--z: 9.5;");
  });

  it("turns the card by 7 and 9 degrees toward the pointer, in a perspective of three card widths", () => {
    expect(rule(".mc-eclat__persp")).toContain("perspective: 300cqw;");
    const tilt = rule(":is(.mc-eclat--active, .mc-eclat--idle, .mc-eclat--settle) .mc-eclat__tilt");
    expect(tilt).toContain("transform-style: preserve-3d;");
    expect(tilt).toContain("rotateX(calc(var(--mc-ay) * 7deg * var(--mc-t)))");
    expect(tilt).toContain("rotateY(calc(var(--mc-ax) * 9deg * var(--mc-t)))");
    // and only then: at rest there is no transform at all
    expect(rule(".mc-eclat__tilt")).toContain("transform: none;");
  });

  it("lifts each layer by its depth and shrinks it so the layers still line up face-on", () => {
    const lift = rule(
      ":is(.mc-eclat--active, .mc-eclat--idle, .mc-eclat--settle) :is(.mc-l, .mc-eclat__foil)",
    );
    expect(lift).toContain("translateZ(calc(var(--z) * 1cqw * var(--mc-t)))");
    expect(lift).toContain("scale(calc(1 - var(--z) * var(--mc-t) / 300))");
    // at rest the layers carry no transform of their own, so every one is rasterised once, unresampled
    expect(rule(".mc-l")).toContain("transform: none;");
  });

  it("hands the rims' two-dimensional step over to real depth through --mc-t", () => {
    expect(rule(".mc-rim")).toContain(
      "transform: translate(calc(var(--o) * 0.12cqw * var(--mc-dx)), calc(var(--o) * 0.12cqw));",
    );
    const moving = rule(":is(.mc-eclat--active, .mc-eclat--idle, .mc-eclat--settle) .mc-rim");
    expect(moving).toContain("calc(var(--o) * 0.12cqw * var(--mc-dx) * (1 - var(--mc-t)))");
    expect(moving).toContain("calc(var(--z) * 1cqw * var(--mc-t))");
  });

  it("registers the light and the depth as numbers, so they ease and animate", () => {
    for (const name of ["--mc-ax", "--mc-ay", "--mc-t"]) {
      expect(bare).toMatch(
        new RegExp(`@property ${name}\\s*\\{\\s*syntax:\\s*"<number>";\\s*inherits:\\s*true;`),
      );
    }
  });

  it("has the contact shadow lie opposite the light, in light and dark, outside the 3D tree", () => {
    const sh = rule(".mc-eclat__shadow");
    expect(sh).toContain("inset: 5% 7% -2.5% 7%;");
    expect(sh).toContain("filter: blur(4.5cqw);");
    expect(sh).toContain(
      "transform: translate(calc(var(--mc-ax) * -5cqw), calc(3cqw + var(--mc-ay) * 3cqw));",
    );
    expect(sh).toContain("background: rgb(8 12 24 / 0.42);");
    expect(rule(".mc-eclat--dark .mc-eclat__shadow")).toContain("rgb(0 0 0 / 0.7)");
    const html = draw(MOCK_CARDS[3]!.profile);
    // a sibling of the perspective box, drawn before it, so its blur flattens nothing
    expect(html.indexOf("mc-eclat__shadow")).toBeLessThan(html.indexOf("mc-eclat__persp"));
    expect(html.match(/mc-eclat__shadow[^>]*><\/div><div class="mc-eclat__persp"/)).not.toBeNull();
  });

  it("raises the number: a shade and a highlight that follow the light, in the number layer only", () => {
    expect(rule(".mc-num-hi")).toBe(
      "transform: translate(calc(var(--mc-ax) * 4px), calc(var(--mc-ay) * -4px - 2px));",
    );
    expect(rule(".mc-num-sh")).toBe(
      "transform: translate(calc(var(--mc-ax) * -6px), calc(var(--mc-ay) * 6px + 5px));",
    );
    const html = draw(MOCK_CARDS[3]!.profile);
    for (const name of ["base", "shirt", "frame"]) {
      expect(layer(html, name)!.includes("mc-num-"), name).toBe(false);
    }
    expect(layer(html, "num")!.includes("mc-num-hi")).toBe(true);
    expect(layer(html, "num")!.includes("mc-num-sh")).toBe(true);
  });

  it("asks the browser for a layer of its own only while a pointer moves", () => {
    const hints = [...bare.matchAll(/([^{}]+)\{[^{}]*will-change[^{}]*\}/g)].map((m) =>
      m[1]!.trim(),
    );
    expect(hints).toEqual([".mc-eclat--active .mc-eclat__tilt"]);
    expect(bare.includes("backface-visibility: hidden")).toBe(true);
  });

  it("is the sheen's angle that turns round for Arabic, and the sheen that follows the light", () => {
    expect(rule(".mc-eclat__foil")).toContain("--mc-sheen-angle: 115deg;");
    expect(rule('.mc-eclat[dir="rtl"] .mc-eclat__foil')).toContain("--mc-sheen-angle: 245deg;");
    const before = rule(".mc-eclat__foil::before");
    expect(before).toContain("mix-blend-mode: soft-light;");
    expect(before).toContain("calc(50% + var(--mc-ax) * 40%)");
    expect(before).toContain("rgb(255 255 255 / var(--mc-sheen))");
  });

  it("sets the sheen and the foil's strength as the card's own variables, per tier", () => {
    for (const key of TIER_KEYS) {
      const p =
        key === "base"
          ? MOCK_CARDS[0]!.profile
          : MOCK_CARDS.find((c) => c.profile.tier === key)!.profile;
      const style = /<div class="mc-eclat [^"]*" role="img"[^>]*style="([^"]*)"/.exec(draw(p))![1]!;
      expect(style, key).toMatch(/^--mc-sheen:[\d.]+;--mc-holo:[\d.]+$/);
      const holo = Number(/--mc-holo:([\d.]+)/.exec(style)![1]);
      expect(holo > 0, key).toBe(key === "champion" || key === "legend");
    }
  });
});
