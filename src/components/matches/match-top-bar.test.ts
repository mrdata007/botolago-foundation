import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The match page's two bars cross-fade, and there is no component-test harness
 * here (see `failure-aware-image.test.ts`), so the two pieces that fix the
 * compact bar's look are pinned as source text. Both were measured in a
 * browser against real data with the transition slowed down: the date line of
 * the match header showed through the bars mid-swap, and a white-kit club's
 * half (CODM) had no edge, so the bar looked filled on one side only.
 */
const SOURCE = readFileSync(join(import.meta.dir, "MatchTopBar.tsx"), "utf8");

describe("MatchTopBar", () => {
  it("keeps an opaque surface behind both bars, so nothing shows through mid cross-fade", () => {
    expect(SOURCE).toMatch(
      /data-match-bar=""\s+className=\{cn\("sticky top-0 z-30", ui\.surface\.bar\)\}/,
    );
  });

  it("gives the compact bar the white bar's hairline across its whole width", () => {
    expect(SOURCE).toMatch(/ui\.rule\.block,\s*!shown && "pointer-events-none opacity-0"/);
  });
});
