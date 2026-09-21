import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// An article's body is injected as one blob of sanitized HTML, so utility
// classes on the wrapper cannot reach the paragraphs, headings or figures
// inside it. That HTML is styled by a single `.editorial-body` rule set.
//
// Two ways this silently broke before, both of which shipped:
//   - the public page put `space-y-4` on a wrapper whose only child was the
//     injected blob, so it spaced exactly one element and the body ran
//     together with no paragraph gaps at all;
//   - the CMS preview used `prose prose-invert prose-img:rounded-xl`, which
//     generate nothing because @tailwindcss/typography is not a dependency.
//     An editor placing an image previewed something a reader never sees.
// Neither failed a test, a typecheck or a lint. They just looked wrong.

const root = join(import.meta.dir, "..", "..");
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

const READER = "src/routes/news.$articleId.tsx";
const PREVIEW = "src/routes/admin.news.$articleEditionId.tsx";

describe("editorial body styling", () => {
  it("defines the rules the injected HTML needs", () => {
    const css = read("src/styles.css");
    expect(css).toContain(".editorial-body");
    // The elements an article body can actually contain, per the sanitizer
    // allowlist. A figure or figcaption with no rule renders at browser
    // defaults -- and the UA default `margin: 1em 40px` on <figure> eats 80px
    // of a 390px phone viewport.
    for (const selector of [
      ".editorial-body p",
      ".editorial-body h2",
      ".editorial-body ul",
      ".editorial-body ol",
      ".editorial-body blockquote",
      ".editorial-body figure",
      ".editorial-body figcaption",
      ".editorial-body a",
    ]) {
      expect(css).toContain(selector);
    }
  });

  it("styles the reader and the CMS preview with the same class", () => {
    // If these diverge, an editor previews something the reader never sees.
    expect(read(READER)).toContain("editorial-body");
    expect(read(PREVIEW)).toContain("editorial-body");
  });

  it("does not put spacing utilities on a wrapper whose only child is the blob", () => {
    // `space-y-*` and `divide-y-*` work between siblings; the injected HTML is
    // a single child, so they silently do nothing here.
    // Comments are stripped first: this file's own explanation of the old bug
    // names `space-y-4`, and matching that would be checking the prose.
    const reader = read(READER)
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const wrapper = reader.slice(
      Math.max(0, reader.indexOf("editorial-body") - 400),
      reader.indexOf("editorial-body") + 400,
    );
    expect(wrapper).not.toMatch(/\bspace-y-\d/);
    expect(wrapper).not.toMatch(/\bdivide-y\b/);
  });

  it("uses no typography-plugin classes while the plugin is absent", () => {
    // `prose` and its variants compile to nothing without the plugin, so they
    // read as styling but apply none.
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = "@tailwindcss/typography" in { ...pkg.dependencies, ...pkg.devDependencies };
    if (installed) return;

    for (const file of [READER, PREVIEW]) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code).not.toMatch(/\bprose(-[\w[\]:.-]+)?\b/);
    }
  });

  it("keeps the figure rules logical, so an Arabic article mirrors", () => {
    const css = read("src/styles.css");
    const block = css.slice(css.indexOf(".editorial-body"));
    // Physical margins/padding would not flip for RTL.
    expect(block).not.toMatch(/\.editorial-body[^{]*\{[^}]*margin-left/);
    expect(block).not.toMatch(/\.editorial-body[^{]*\{[^}]*padding-left/);
    expect(block).toContain("padding-inline-start");
    expect(block).toContain("border-inline-start");
  });
});
