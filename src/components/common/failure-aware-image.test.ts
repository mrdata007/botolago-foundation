import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The image fallbacks run from the `<img>`'s `error` event, and a
 * server-rendered image can fail before React is listening. React 19 does not
 * replay that event, so the fallbacks never ran: measured in Chromium on a
 * page hydrated 2.5s late with every resize failing, crests and photos stayed
 * broken, and so did a plain image whose file was missing. Asking again once
 * mounted fixed all of them. There is no component-test harness here (see
 * `article-hero-fallback.test.ts`), so the pieces are pinned as source text.
 */
const SOURCE = readFileSync(join(import.meta.dir, "FailureAwareImage.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("FailureAwareImage: a failure before hydration", () => {
  it("is asked for again once mounted, if the image already shows as broken", () => {
    expect(SOURCE).toContain("ref={imageRef}");
    expect(SOURCE).toContain("if (!image?.complete || image.naturalWidth > 0) return;");
    // Not a no-op: setting `src`, even to the same value, makes the browser
    // load the image again, and a broken one fires `error` again.
    expect(SOURCE).toContain("image.src = current;");
  });

  it("then drops the resized copies before giving up on the original", () => {
    expect(SOURCE).toContain("srcSet={useCopies ? srcSet : undefined}");
    expect(SOURCE).toMatch(/if \(useCopies\) \{\s*setCopiesFailed\(true\);\s*return;\s*\}/);
  });
});
