import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The action gradient marks actions and progress (DESIGN.md, The Earned
 * Gradient Rule), not decoration. An icon sitting in a gradient disc beside a
 * heading is the template look this pass removed (2026-10-30): the rules
 * page's nine rule headings, the prize cards' tier labels and the Fantasy
 * intro's points now carry a plain icon or none.
 */
const SRC = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

describe("no gradient icon discs", () => {
  for (const file of [
    "routes/fantasy.rules.tsx",
    "components/prizes/PrizesPage.tsx",
    "components/fantasy/FantasyGuestIntro.tsx",
    "components/manager-card/inline/GuestIntroCardPoint.tsx",
  ]) {
    it(file, () => {
      // PrizesPage's call to action is a kit button; the gradient never
      // appears as an inline style on a disc in these files.
      expect(read(file)).not.toMatch(/h-(9|10) w-(9|10)[\s\S]{0,200}--ui-grad-action/);
    });
  }
});
