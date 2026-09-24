import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { SectionGroupHeader, SectionHeader } from "@/components/common/SectionHeader";
import { LiveIndicator } from "@/components/matches/LiveIndicator";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";

/**
 * Option A — the shared shell and the common blocks every screen uses.
 *
 * The kit contract (`ui-kit.contract.test.ts`) already holds AppShell,
 * TopBar, BottomNav and PageBackground to the kit, to logical utilities and
 * to `ltr:`-only tracking. This file pins what Option A decided on top of
 * that, so a later edit cannot quietly walk it back: the nav's second state
 * cue, the flat page, the round controls, the live pill's translated word,
 * and the BG-0083 rule (`--ui-ink` is a fill, never a text colour) in the
 * shell files the kit test does not scan.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
/** Source without comments, so the notes that NAME a retired class don't trip a rule. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const SHELL_FILES = [
  "src/components/shell/AppShell.tsx",
  "src/components/shell/TopBar.tsx",
  "src/components/shell/BottomNav.tsx",
  "src/components/shell/PageBackground.tsx",
  "src/components/shell/LanguageSwitcher.tsx",
  "src/components/shell/FirstLaunchLanguage.tsx",
  "src/components/shell/ThemeSwitcher.tsx",
];

const COMMON_FILES = [
  "src/components/common/ClubCrest.tsx",
  "src/components/common/SectionHeader.tsx",
  "src/components/common/Section.tsx",
  "src/components/common/States.tsx",
  "src/components/matches/LiveIndicator.tsx",
  "src/components/matches/LiveStrip.tsx",
];

describe("Option A shell — BG-0083: --ui-ink is a fill, never a foreground", () => {
  for (const file of [...SHELL_FILES, ...COMMON_FILES]) {
    it(`${file} never writes --ui-ink as a text, ring or caret colour`, () => {
      expect(code(file)).not.toMatch(
        /(text|placeholder|ring|caret|decoration)-\[color:var\(--ui-ink\)\]/,
      );
    });
  }
});

describe("Option A shell — physical direction and letter-spacing", () => {
  for (const file of [...SHELL_FILES, ...COMMON_FILES]) {
    const source = code(file);
    it(`${file} uses logical utilities only`, () => {
      expect(source).not.toMatch(/(^|[\s"'`{])-?(ml|mr|pl|pr)-[\w.[\]/-]+/m);
      expect(source).not.toMatch(/\btext-(left|right)\b/);
      expect(source).not.toMatch(/\b(border|rounded)-(l|r)(-[\w.[\]/-]+)?(?![\w-])/);
      expect(source).not.toMatch(/(^|[\s"'`])-?(left|right)-[\w.[\]/-]+/m);
    });
    it(`${file} letter-spaces nothing unless ltr:`, () => {
      const offenders = [...source.matchAll(/(.{0,4})tracking-[\w[\]./-]+/g)]
        .filter((m) => !m[1].endsWith("ltr:"))
        .map((m) => m[0].trim());
      expect(offenders).toEqual([]);
    });
    it(`${file} carries no colour literal`, () => {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/\brgba?\(/);
      expect(source).not.toMatch(/\b(bg|text|border|ring|fill|stroke)-(white|black)\b/);
    });
  }
});

describe("Option A shell — top bar", () => {
  const topBar = code("src/components/shell/TopBar.tsx");
  const switcher = code("src/components/shell/LanguageSwitcher.tsx");

  it("is the opaque bar with a hairline only — no card shadow on top of the rule", () => {
    expect(topBar).toContain("ui.surface.bar");
    expect(topBar).toContain("ui.rule.block");
    expect(topBar).not.toContain("--ui-shadow-card");
  });

  it("keeps the geometry --topbar-h is computed from (safe-top + 44px row + pb-2)", () => {
    expect(topBar).toContain("ui.safe.top");
    expect(topBar).toContain('"pb-2"');
    expect(topBar).toContain("min-h-[var(--ui-tap-min)]");
    expect(read("src/styles.css")).toContain(
      "--topbar-h: calc(max(env(safe-area-inset-top, 0px), 0.75rem) + var(--ui-tap-min) + 0.5rem + 1px);",
    );
  });

  it("rounds the desktop nav links and marks the active one white on navy", () => {
    expect(topBar).toContain("ui.radius.full");
    expect(topBar).toContain("ui.surface.inkPlain");
    expect(topBar).not.toContain("ui.radius.control");
    expect(topBar).toContain('aria-current={active ? "page" : undefined}');
  });

  it("draws the language trigger as the round 44px soft button, FR / ع", () => {
    expect(switcher).toContain("<UiIconButton");
    expect(switcher).toContain('lang === "fr" ? "FR" : "ع"');
    // The name still says what the button does; the letters alone do not.
    expect(switcher).toContain('aria-label={t("language.switch")}');
    // The mesh variant (Welcome, and any dark-register screen) is still there.
    expect(switcher).toContain("ui.surface.mesh");
    expect(switcher).toContain("ui.focusOnMesh");
    expect(switcher).not.toContain("ui.radius.control");
  });
});

describe("Option A shell — bottom nav", () => {
  const nav = code("src/components/shell/BottomNav.tsx");

  it("paints the action-gradient pill behind the ACTIVE icon only", () => {
    expect(nav).toContain(
      'style={active ? { backgroundImage: "var(--ui-grad-action)" } : undefined}',
    );
    expect(nav).toContain("text-[color:var(--ui-ink-deep)]");
    expect(nav).toContain("h-8 w-14");
    expect(nav).toContain("ui.radius.full");
  });

  it("keeps a second state cue besides the 1.3:1 pill: label weight and colour, and aria-current", () => {
    expect(nav).toContain('aria-current={active ? "page" : undefined}');
    expect(nav).toMatch(
      /active\s*\?\s*cn\(ui\.tone\.default, "\[font-weight:var\(--ui-weight-heavy\)\]"\)/,
    );
    expect(nav).toContain("ui.tone.muted");
    expect(nav).toContain('"[font-weight:var(--ui-weight-strong)]"');
  });

  it("drops the old block-start ink bar", () => {
    expect(nav).not.toContain("bg-[color:var(--ui-ink)]");
    expect(nav).not.toContain("h-0.5");
  });

  it("lays out whatever the nav list holds — 4 items with News off, 5 with it on", () => {
    expect(nav).toContain("primaryNavItems.map");
    expect(nav).toContain("flex-1");
    expect(nav).not.toMatch(/grid-cols-\d/);
  });

  it("puts no local leading on the truncating label (BG-0124)", () => {
    expect(nav).toContain('<span className="max-w-full truncate">');
    expect(nav).not.toMatch(/leading-(none|tight|normal)/);
  });

  it("keeps --bottomnav-h declared", () => {
    expect(read("src/styles.css")).toContain("--bottomnav-h:");
  });
});

describe("Option A shell — page background", () => {
  const bg = code("src/components/shell/PageBackground.tsx");

  it("is flat: no per-route wash", () => {
    expect(bg).not.toContain("--ui-wash-");
    expect(bg).not.toContain("radial-gradient");
    expect(bg).toContain("ui.surface.page");
  });

  it("keeps the dark mesh for the auth register (Welcome)", () => {
    expect(bg).toContain('"mesh-base mesh-auth"');
    expect(bg).toContain('v === "auth" && photo');
    expect(bg).toMatch(/welcome:\s*\{/);
  });
});

describe("Option A shell — AppShell slots", () => {
  const shell = code("src/components/shell/AppShell.tsx");

  it("renders the replacement top bar, else the global one", () => {
    expect(shell).toContain("{topBar ?? <TopBar />}");
  });

  it("renders the full-bleed page header outside the content column, before the live strip", () => {
    const header = shell.indexOf("{pageHeader}");
    expect(header).toBeGreaterThan(shell.indexOf("{topBar ?? <TopBar />}"));
    expect(header).toBeLessThan(shell.indexOf("{liveStrip && <LiveStrip />}"));
    expect(header).toBeLessThan(shell.indexOf("<UiScreen"));
  });
});

describe("Option A common blocks", () => {
  it("SectionHeader sets the title in the display face with a 44px 'Tout voir'", () => {
    const header = code("src/components/common/SectionHeader.tsx");
    expect(header).toContain("ui.display.section");
    expect(header).toMatch(/function SectionHeaderLink[\s\S]*ui\.space\.tap/);
    expect(header).not.toContain("--brand-accent");
  });

  it("Section breaks at the Option A rhythm", () => {
    expect(code("src/components/common/Section.tsx")).toContain('"mt-5 sm:mt-8"');
  });

  it("States use the card radius and filled panels, not the 6px dashed box", () => {
    const states = code("src/components/common/States.tsx");
    expect(states).not.toContain("ui.radius.control");
    expect(states).not.toContain("border-dashed");
    expect(states).toContain("ui.radius.card");
  });

  it("LiveStrip draws each live match as the navy pill with the two clubs' discs", () => {
    const strip = code("src/components/matches/LiveStrip.tsx");
    // The navy pill, at the tap floor, not the old sunken chip.
    expect(strip).toContain("ui.surface.inkPlain");
    expect(strip).not.toContain("ui.surface.sunken");
    expect(strip).toContain("min-h-[var(--ui-tap-min)]");
    expect(strip).toContain("ui.radius.full");
    // Both discs, coloured by the clash-resolved pair (a crest sets its own
    // `data-club`, so each is handed its side's palette).
    expect(strip).toContain("clubMatchPalettes(home, away)");
    expect(strip).toContain("palette={colours.home}");
    expect(strip).toContain("palette={colours.away}");
    expect(strip).toContain('size="xs"');
    // The score: display-face figures as three flex children, the container
    // following the page direction and each figure in its own <bdi>.
    expect(strip).toContain("ui.score.row");
    expect(strip).toMatch(/<bdi>\{hs\}<\/bdi>\s*<span aria-hidden>–<\/span>\s*<bdi>\{as\}<\/bdi>/);
    expect(strip).not.toMatch(/<bdi\b[^>]*className=[^>]*\bflex\b/);
    // The breathing dot stays, and the minute is plain on navy (not live-fg).
    expect(strip).toContain("live-breathe");
    expect(strip).not.toContain("ui.tone.live");
  });

  it("LiveIndicator is the kit's live pill, with none of the V1 literals", () => {
    const live = code("src/components/matches/LiveIndicator.tsx");
    expect(live).toContain("<UiLivePill");
    expect(live).not.toMatch(/text-\[1[01]px\]/);
    expect(live).not.toContain("font-black");
    expect(live).not.toContain("--color-live");
    expect(live).not.toMatch(/["'>]\s*LIVE\s*["'<]/);
  });
});

describe("Option A common blocks — rendered", () => {
  const inFrench = (node: React.ReactElement) =>
    renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

  it("LiveIndicator says the translated word, with the minute isolated in <bdi>", () => {
    const html = inFrench(<LiveIndicator minute={63} />);
    expect(html).toContain(dictionaries.fr["matches.status.live"]);
    expect(html).not.toMatch(/>\s*LIVE\s*</);
    expect(html).toContain("<bdi");
    expect(html).toContain("63′");
    expect(html).toContain("bg-[color:var(--ui-ink)]");
    expect(html).toContain("rounded-full");
  });

  it("LiveIndicator accepts a stoppage-time minute as a string", () => {
    expect(inFrench(<LiveIndicator minute="45+2" size="md" />)).toContain("45+2′");
  });

  it("SectionHeader renders one heading in the display face, accents in the themed brand colour", () => {
    const html = inFrench(<SectionHeader title="À {accent}venir{/accent}" />);
    expect(html.match(/<h2[\s>]/g)?.length).toBe(1);
    expect(html).toContain("[font-family:var(--ui-font-display)]");
    expect(html).toContain("text-[color:var(--ui-ink-fg)]");
    expect(html).not.toContain("text-brand");
  });

  it("SectionHeader can be a sub-heading", () => {
    const html = inFrench(<SectionHeader as="h3" title="Mes ligues" />);
    expect(html).toContain("<h3");
    expect(html).not.toContain("<h2");
  });

  it("SectionGroupHeader is a muted label with an optional count", () => {
    const html = inFrench(<SectionGroupHeader title="Mercredi 23 septembre" meta="2 matchs" />);
    expect(html).toContain("<h3");
    expect(html).toContain("uppercase");
    expect(html).toContain("text-[color:var(--ui-on-surface-muted)]");
    expect(html).toContain("2 matchs");
  });
});
