import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source rules for the Gradins screens, checked on the files themselves (plan sections 4.0 and
 * 6.5): the card is reached through `ManagerCard`, `CardToken` and the renderer hook, never by
 * importing a direction; the screens are loaded by the section's routes alone; logical properties
 * only; no generic entrance.
 */
const HERE = import.meta.dir;
const SRC = join(HERE, "..", "..");

const sources = readdirSync(HERE)
  .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name))
  .map((name) => ({ name, text: readFileSync(join(HERE, name), "utf8") }));

const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("the Gradins screens' imports", () => {
  it("never import a card direction: the card comes through the wrappers", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(/from "[^"]*\/eclat[/"]/);
      expect(code(text), name).not.toMatch(/from "[^"]*plain-renderer"/);
      expect(code(text), name).not.toMatch(/from "[^"]*active-renderer"/);
    }
  });

  it("are imported, outside this folder and its routes, by nothing: the section loads on its own", () => {
    const allowed = [join("src", "routes", "gradins"), join("src", "components", "gradins")];
    const root = join(SRC, "..");
    const offenders = walk(SRC)
      .filter((file) => !file.includes(join("components", "gradins")))
      .filter((file) => !/gradins[^/]*\.tsx$/.test(file) || !file.includes("routes"))
      .filter((file) => /components\/gradins\//.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(root.length + 1))
      .filter((file) => !allowed.some((prefix) => file.startsWith(prefix)));
    expect(offenders).toEqual([]);
  });

  it("never word the two state lines WP4 owns: the new-season sentence and the fall below the best tier", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(/m10\.started|moments\.m8\.downLine/);
    }
  });

  it("do not import the fixtures or the mock repository", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(/manager-card\/(fixtures|mock-repository)/);
    }
  });
});

describe("the stage's room", () => {
  it("gives the card's column 352 px from 768 px: the 336 px card and 8 px of the stage's padding each side", () => {
    for (const name of ["GradinsHome.tsx", "GradinsCardPage.tsx"]) {
      const text = code(readFileSync(join(HERE, name), "utf8"));
      expect(text, name).toContain("md:grid-cols-[352px_minmax(0,1fr)]");
      expect(text, name).not.toContain("264px");
    }
  });
});

describe("the people block's heading", () => {
  it("is not cut: it is not a SectionHeader (which truncates its title beside a link); the link wraps under it", () => {
    const text = code(readFileSync(join(HERE, "PeopleBlock.tsx"), "utf8"));
    expect(text).not.toMatch(/<SectionHeader\b/);
    expect(text).toContain("flex-wrap");
    const heading = text.match(/<h2 className=\{cn\(([^)]*)\)\}/)![1]!;
    expect(heading).not.toContain("truncate");
  });
});

describe("the Gradins screens' styling", () => {
  it("draws no coloured bar down the side of a card (a craft-floor ban): the club disc carries the colour", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(/ui\.edge\.(?:start|end)\b/);
      expect(code(text), name).not.toMatch(/\bborder-[se]-(?:[2-9]|\d\d)\b/);
    }
  });

  it("uses logical properties only (start and end, never left and right)", () => {
    const physical =
      /(?:^|[\s"'`:])(?:-?(?:ml|mr|pl|pr)-|(?:left|right)-\d|text-(?:left|right)|border-[lr]\b|border-[lr]-|rounded-[lr]-|rounded-(?:tl|tr|bl|br)-)/;
    for (const { name, text } of sources) {
      const classes = [...code(text).matchAll(/"([^"\n]*)"/g)].map((m) => m[1]!).join("\n");
      expect(classes, name).not.toMatch(physical);
    }
  });

  it("letter-spaces nothing that Arabic could inherit", () => {
    for (const { name, text } of sources) {
      for (const match of code(text).matchAll(/(?<!ltr:)tracking-[a-z[]\S*/g)) {
        throw new Error(`${name}: ${match[0]}`);
      }
    }
  });

  it("brings no generic entrance: no fade-up, slide-in, stagger or scale pop", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(
        /enter-rise|drift-in|\bstagger\b|animate-in|fade-in|slide-in|zoom-in|animate-\[|scale-\[?1[0-9]/,
      );
    }
  });

  it("sets no colour literal: the club's colours come from the palette, the rest from tokens", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|oklch\(/);
    }
  });

  it("takes no shadow, radius or letter-case outside the kit's tokens", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(/shadow-\[(?!var)|rounded-\[(?!var)|\buppercase\b/);
    }
  });
});

describe("the Gradins screens' words", () => {
  it("add no dictionary key of their own: every key they read already exists", () => {
    const fr = readFileSync(join(SRC, "i18n", "dictionary-fr.ts"), "utf8");
    for (const { name, text } of sources) {
      for (const match of code(text).matchAll(/\bt\("([a-z0-9_.]+)"\)/g)) {
        expect(fr, `${name}: ${match[1]}`).toContain(`"${match[1]}"`);
      }
    }
  });
});

describe("« Revoir » is the button and « Vos moments » is the section", () => {
  it("names the list of moments « Vos moments » / «لحظاتك», never the replay button's own word", () => {
    const heading = /<SectionHeader title=\{([^}]+)\}/g;
    for (const name of ["GradinsCardPage.tsx", "GradinsSeasonsPage.tsx"]) {
      const text = code(readFileSync(join(HERE, name), "utf8"));
      const titles = [...text.matchAll(heading)].map((match) => match[1]);
      expect(titles, name).toContain("copy.revoirTitle");
      expect(titles, name).not.toContain("moments.m4.sheetReplay");
      expect(text, name).toContain("aria-label={copy.revoirTitle}");
    }
  });

  it("has its own words in both languages, different from the replay button's", async () => {
    const { dictionaries } = await import("@/i18n/dictionaries");
    expect(dictionaries.fr["gradins.revoir.title"]).toBe("Vos moments");
    expect(dictionaries.ar["gradins.revoir.title"]).toBe("لحظاتك");
    for (const lang of ["fr", "ar"] as const) {
      expect(dictionaries[lang]["gradins.revoir.title"]).not.toBe(
        dictionaries[lang]["card.onboarding.m4.sheet.replay"],
      );
    }
  });
});
