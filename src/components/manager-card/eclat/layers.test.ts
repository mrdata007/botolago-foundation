import { describe, expect, it } from "bun:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FOIL, TIER_KEYS } from "./foil";
import { RING, TOKEN_WINDOW, TIER_BAR, TAB, WINDOW, WINDOW_IN } from "./geometry";
import { eclatRenderer } from "./index";
import { FR, AR, MOCK_ARABIC, MOCK_CARDS, PROFILES } from "./test-data";
import { elementsByClass, layer, tokenise, texts } from "./test-markup";
import type { CardProfile, TokenSize } from "../types";

const draw = (p: CardProfile, o: { compact?: boolean; lang?: "fr" | "ar" } = {}) =>
  eclatRenderer.full(p, { strings: o.lang === "ar" ? AR : FR, theme: "light", compact: o.compact });
const tok = (p: CardProfile, size: number, lang: "fr" | "ar" = "fr") =>
  eclatRenderer.token(p, {
    strings: lang === "ar" ? AR : FR,
    theme: "light",
    size: size as TokenSize,
  });

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

describe("tokens and minis (plan 7)", () => {
  const tokens = (size: number, p: CardProfile = MOCK_CARDS[3]!.profile) => tok(p, size);

  it("is one flat SVG: no layers, no filters, no blur, no patterns, no masks, no foil overlay", () => {
    for (const size of [80, 64, 56, 44, 32, 28, 24]) {
      for (const c of [...MOCK_CARDS, ...MOCK_ARABIC]) {
        const h = tok(c.profile, size, c.lang);
        expect(h.match(/<svg/g), `${size}`).toHaveLength(1);
        expect(
          /<filter|<pattern|<mask|feGaussianBlur|mc-eclat__foil|mc-l /.test(h),
          `${size}`,
        ).toBe(false);
        expect(h.startsWith(`<span class="mc-tok mc-tok--${size}"`)).toBe(true);
        expect(h.match(/role="img"/g)).toHaveLength(1);
      }
    }
  });

  it("is a box of 0.618 of its height", () => {
    expect(tokens(64)).toContain("width:40px;height:64px");
    expect(tokens(24)).toContain("width:15px;height:24px");
    expect(tokens(80)).toContain("width:49px;height:80px");
  });

  it("draws the card at 80: the shield window, the tier bar and the metal edge", () => {
    const h = tokens(80);
    expect(h).toContain(`d="${TOKEN_WINDOW}"`);
    expect(h).toContain(`d="${TIER_BAR}"`);
    expect(h.match(/data-mc="ovr"/g)).toHaveLength(1);
  });

  it("draws the jersey at 28 to 64: a ring in the tier's colour, a tier bar at 64, a foot band below", () => {
    expect(tokens(64)).not.toContain(`d="${TOKEN_WINDOW}"`);
    expect(tokens(64)).toContain(`d="${TIER_BAR}"`);
    for (const size of [56, 44, 32, 28]) {
      expect(tokens(size), String(size)).not.toContain(`d="${TIER_BAR}"`);
      expect(tokens(size), String(size)).toContain('width="1000" height=');
    }
    expect(tokens(64)).toContain(`stroke="${FOIL.pro.tokEdge}"`);
    // the ring is the foil on CHAMPION and LEGEND
    expect(tokens(48, MOCK_CARDS[5]!.profile)).toContain("url(#mc-t-");
  });

  it("draws the mini at 24 without the number and every size with its label", () => {
    expect(tokens(24)).not.toContain('data-mc="ovr"');
    expect(tokens(28)).toContain('data-mc="ovr"');
    const label = /aria-label="([^"]*)"/.exec(tokens(64))![1]!;
    expect(label).toBe("Ali, 84 OVR, PRO");
    expect(/aria-label="([^"]*)"/.exec(tok(PROFILES.born0, 64))![1]).toContain(
      "pas encore de note",
    );
    expect(tok(PROFILES.born0, 64)).toContain(">—</text>");
  });

  it("mirrors the shapes in Arabic and never the number", () => {
    const h = tok(MOCK_ARABIC[0]!.profile, 64, "ar");
    expect(h).toContain('dir="rtl"');
    expect(h).toContain("matrix(-1 0 0 1 1000 0)");
    expect(texts(h).every((t) => !(t.attrs.transform ?? "").includes("matrix"))).toBe(true);
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
