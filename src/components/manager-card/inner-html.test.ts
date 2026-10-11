import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A card's markup is set with `dangerouslySetInnerHTML`, and React 19 sets it again whenever the
 * prop is a new object, even with the same string: the whole card is then replaced. Inline
 * `{{ __html: … }}` in a card component is how that happened (eight redraws on a page load, four
 * for one flip); `useInnerHtml` keeps one object per string. This reads the card's own components.
 */
const SRC = join(import.meta.dir, "..", "..");
const FOLDERS = ["components/manager-card", "components/curva"];

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

describe("the card's markup is set once per string", () => {
  const sources = FOLDERS.flatMap((folder) => files(join(SRC, folder))).map((path) => ({
    path: path.slice(SRC.length + 1),
    text: readFileSync(path, "utf8"),
  }));

  it("finds the card's components", () => {
    expect(sources.some((s) => s.path.endsWith("ManagerCard.tsx"))).toBe(true);
  });

  it("never writes `dangerouslySetInnerHTML={{ … }}` inline in a card component", () => {
    for (const { path, text } of sources) {
      expect(text, path).not.toMatch(/dangerouslySetInnerHTML=\{\{/);
    }
  });

  it("draws the card, its token and the founder's detail through `useInnerHtml`", () => {
    for (const name of [
      "manager-card/ManagerCard.tsx",
      "manager-card/CardToken.tsx",
      "curva/FounderBlock.tsx",
    ]) {
      const source = sources.find((s) => s.path.endsWith(name))!;
      expect(source.text, name).toContain("useInnerHtml(");
    }
  });
});
