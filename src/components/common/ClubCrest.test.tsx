import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { clubMatchPalettes, clubPalette } from "@/lib/club-palette";
import type { Club } from "@/types/domain";
import { ClubCrest } from "./ClubCrest";
import { crestMonogramClass, crestStyleKey } from "./club-crest-style";

/**
 * Option A's crest is a DISC coloured by the club palette. `ClubCrest` needs
 * no router and no i18n, so these render it for real (`react-dom/server`
 * needs no DOM) and assert on the markup a reader receives.
 *
 * The clubs are production-shaped: `primary_color` is null for every club in
 * production (BG-0112) and the football presenter writes `var(--ui-ink)` in
 * its place, so the colour has to come from the kit table by name.
 */

function club(overrides: Partial<Club> & Pick<Club, "crestPlaceholder">): Club {
  const name = overrides.name ?? { fr: "Unknown FC", ar: "Unknown FC" };
  return {
    id: "1b0c5e2a-0000-4000-8000-000000000000",
    name,
    shortName: name,
    city: { fr: "", ar: "" },
    primaryColor: "var(--ui-ink)",
    ...overrides,
  };
}

const WYDAD = club({
  name: { fr: "Wydad Casablanca", ar: "Wydad Casablanca" },
  crestPlaceholder: "WAC",
});
const FUS = club({ name: { fr: "FUS Rabat", ar: "FUS Rabat" }, crestPlaceholder: "FUS" });
const UNKNOWN = club({ crestPlaceholder: "UNK" });

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

/** The value of one inline custom property in rendered markup. */
function styleVar(html: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;"]+)`).exec(html)?.[1]?.trim();
}

describe("ClubCrest — the Option A disc", () => {
  it("is a round disc, never the old square plate", () => {
    const html = render(<ClubCrest club={WYDAD} />);
    expect(html).toContain("rounded-full");
    expect(html).not.toContain("--ui-radius-control");
  });

  it("carries the club palette: data-club plus the light and dark --club-* vars", () => {
    const html = render(<ClubCrest club={WYDAD} />);
    expect(html).toContain('data-club=""');
    const palette = clubPalette(WYDAD);
    expect(palette.source).toBe("kit");
    expect(styleVar(html, "--club-fill-l")).toBe(palette.light.fill);
    expect(styleVar(html, "--club-on-l")).toBe(palette.light.on);
    expect(styleVar(html, "--club-fill-d")).toBe(palette.dark.fill);
    expect(styleVar(html, "--club-on-d")).toBe(palette.dark.on);
  });

  it("paints a production club (null colour) in its kit colour, not the ink", () => {
    const html = render(<ClubCrest club={WYDAD} />);
    expect(styleVar(html, "--club-fill-l")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("puts dark letters on a light club, chosen by contrast (FUS orange)", () => {
    const html = render(<ClubCrest club={FUS} />);
    expect(styleVar(html, "--club-on-l")).toBe("var(--ui-ink-deep)");
  });

  it("falls back to the ink for a club the kit table does not know", () => {
    const html = render(<ClubCrest club={UNKNOWN} />);
    expect(styleVar(html, "--club-fill-l")).toBe("var(--ui-ink)");
    expect(styleVar(html, "--club-on-l")).toBe("var(--ui-on-ink-plain)");
  });

  it("solid: the club fill and its measured foreground, with the inner edge ring", () => {
    const html = render(<ClubCrest club={WYDAD} />);
    expect(html).toContain("bg-[color:var(--ui-club)]");
    expect(html).toContain("text-[color:var(--ui-on-club)]");
    expect(html).toContain("ring-[color:var(--ui-club-edge)]");
  });

  it("inverse: a surface disc with the club colour as text, lifted off the block", () => {
    const html = render(<ClubCrest club={WYDAD} tone="inverse" />);
    expect(html).toContain("bg-[color:var(--ui-surface)]");
    expect(html).toContain("text-[color:var(--ui-club-fg)]");
    expect(html).toContain("shadow-[var(--ui-shadow-lifted)]");
    expect(html).not.toContain("bg-[color:var(--ui-club)]");
  });

  it("shows the badge on a light plate when there is an image, the monogram otherwise", () => {
    const withImage = render(
      <ClubCrest club={{ ...WYDAD, crestUrl: "https://example.test/wac.png" }} />,
    );
    expect(withImage).toContain('src="https://example.test/wac.png"');
    expect(withImage).toContain("bg-[color:var(--ui-scorebox)]");
    // The monogram stays underneath: it is what shows if the image fails.
    expect(withImage).toContain(">WAC<");

    const without = render(<ClubCrest club={WYDAD} />);
    expect(without).not.toContain("<img");
    expect(without).toContain(">WAC<");
  });

  it("paints a passed palette instead of the club's own (the clash-resolved away side)", () => {
    // Wydad at home, Tétouan away: the fills paint ΔE 3.4 apart, so the away
    // side becomes Tétouan's white second kit. The crest sets `data-club` on
    // its own root, so without the palette it would stay Tétouan red.
    const TETOUAN = club({
      name: { fr: "Moghreb Tétouan", ar: "Moghreb Tétouan" },
      crestPlaceholder: "MAT",
    });
    const pair = clubMatchPalettes(WYDAD, TETOUAN);
    expect(pair.clash).toBe(true);
    expect(pair.away.source).toBe("secondary");

    const own = render(<ClubCrest club={TETOUAN} />);
    expect(styleVar(own, "--club-fill-l")).toBe(clubPalette(TETOUAN).light.fill);

    const resolved = render(<ClubCrest club={TETOUAN} palette={pair.away} />);
    for (const theme of ["l", "d"] as const) {
      const colours = theme === "l" ? pair.away.light : pair.away.dark;
      expect(styleVar(resolved, `--club-fill-${theme}`)).toBe(colours.fill);
      expect(styleVar(resolved, `--club-on-${theme}`)).toBe(colours.on);
      expect(styleVar(resolved, `--club-edge-${theme}`)).toBe(colours.edge);
    }
    expect(styleVar(resolved, "--club-fill-l")).not.toBe(clubPalette(TETOUAN).light.fill);
    // Everything else about the disc is unchanged: same monogram, same shape.
    expect(resolved).toContain(">MAT<");
    expect(resolved).toContain("rounded-full");
  });

  it("stays decorative: hidden from assistive tech, name as a tooltip", () => {
    const html = render(<ClubCrest club={WYDAD} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('title="Wydad Casablanca"');
  });

  it("keeps its public props: the old sizes still work, and xs is new", () => {
    expect(render(<ClubCrest club={WYDAD} size="xs" />)).toContain("h-7 w-7");
    expect(render(<ClubCrest club={WYDAD} size="sm" />)).toContain("h-8 w-8");
    expect(render(<ClubCrest club={WYDAD} />)).toContain("h-10 w-10");
    expect(render(<ClubCrest club={WYDAD} size="lg" />)).toContain("h-14 w-14");
    // A call-site size override still wins (tailwind-merge, last one).
    const overridden = render(<ClubCrest club={WYDAD} size="sm" className="h-6 w-6" />);
    expect(overridden).toContain("h-6 w-6");
    expect(overridden).not.toContain("h-8");
  });
});

describe("ClubCrest — monogram fit", () => {
  it("caps three letters at 40% of the disc and four at 30%", () => {
    expect(crestMonogramClass("WAC")).toBe("[font-size:min(1em,40cqi)]");
    expect(crestMonogramClass("HUSA")).toBe("[font-size:min(1em,30cqi)]");
    expect(crestMonogramClass(" FAR ")).toBe("[font-size:min(1em,40cqi)]");
    expect(crestMonogramClass("")).toBe("[font-size:min(1em,40cqi)]");
    expect(crestMonogramClass(undefined)).toBe("[font-size:min(1em,40cqi)]");
  });

  it("renders the container-query cap on the monogram", () => {
    expect(render(<ClubCrest club={WYDAD} />)).toContain("@container");
    expect(render(<ClubCrest club={{ ...WYDAD, crestPlaceholder: "CODM" }} />)).toContain("30cqi");
  });
});

describe("ClubCrest — palette cache key", () => {
  it("changes with everything the palette reads", () => {
    const base = crestStyleKey(WYDAD);
    expect(crestStyleKey({ ...WYDAD })).toBe(base);
    expect(crestStyleKey({ ...WYDAD, id: "other" })).not.toBe(base);
    expect(crestStyleKey({ ...WYDAD, slug: "wac" })).not.toBe(base);
    expect(crestStyleKey({ ...WYDAD, primaryColor: "#c8102e" })).not.toBe(base);
    expect(crestStyleKey({ ...WYDAD, secondaryColor: "#ffffff" })).not.toBe(base);
    expect(crestStyleKey({ ...WYDAD, crestPlaceholder: "WYD" })).not.toBe(base);
    expect(crestStyleKey({ ...WYDAD, name: { fr: "Raja", ar: "Raja" } })).not.toBe(base);
  });

  it("gives the same answer from the cache as from a fresh palette", () => {
    const first = render(<ClubCrest club={FUS} />);
    const second = render(<ClubCrest club={{ ...FUS }} />);
    expect(second).toBe(first);
  });
});

describe("ClubCrest — source rules", () => {
  const source = ["ClubCrest.tsx", "club-crest-style.ts"]
    .map((file) => readFileSync(join(import.meta.dir, file), "utf8"))
    .join("\n");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("writes no colour literal and no gradient: the palette owns the colour", () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\(/);
    expect(code).not.toMatch(/gradient\(/);
    expect(code).not.toMatch(/\b(bg|text|ring)-(white|black)\b/);
  });

  it("reads the club colour only through clubStyle, never club.primaryColor directly", () => {
    expect(code).toContain("clubStyle(");
    expect(code).not.toMatch(/color-mix\([^)]*primaryColor/);
  });

  it("uses no physical direction utility", () => {
    expect(code).not.toMatch(/(^|[\s"'`{])-?(ml|mr|pl|pr|left|right)-[\w.[\]/-]+/m);
  });
});
