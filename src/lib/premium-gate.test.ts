import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PREMIUM_BUILD, PREMIUM_PREVIEW, PREMIUM_SURFACES } from "./feature-flags";
import { shouldRedirectFromPlus } from "./premium-gate";

const root = join(import.meta.dir, "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
const curva = (file: string) => read(join("src", "components", "cur" + "va", file));

describe("the BotolaGO+ build flag", () => {
  it("is in the build since the owner's staff-only preview decision (2026-10-14)", () => {
    expect(read("src/lib/feature-flags.ts")).toMatch(/export const PREMIUM_BUILD = true;/);
    expect(PREMIUM_BUILD).toBe(true);
  });
  it("has no development preview outside a development server, and the build lets it exist", () => {
    // Under the test runner `import.meta.env.DEV` is not true, so the preview is off.
    expect(PREMIUM_PREVIEW).toBe(false);
    expect(PREMIUM_SURFACES).toBe(true);
  });
  it("lets the build-level gate through; the database answer is the real gate", () => {
    expect(shouldRedirectFromPlus()).toBe(false);
    expect(shouldRedirectFromPlus(false)).toBe(true);
    expect(shouldRedirectFromPlus(true)).toBe(false);
  });
});

describe("the BotolaGO+ routes", () => {
  it("both redirect before any component runs, through the same gate", () => {
    const offer = read("src/routes/curva.plus.tsx");
    const page = read("src/routes/plus.tsx");
    for (const source of [offer, page]) {
      expect(source).toContain("shouldRedirectFromPlus()");
      expect(source).toMatch(/beforeLoad:[\s\S]*throw redirect/);
      expect(source).toContain('"robots", content: "noindex"');
    }
  });
  it("sits under the Curva layout, which has its own guard", () => {
    expect(read("src/routes/curva.plus.tsx")).toContain('createFileRoute("/curva/plus")');
  });
});

describe("the entry points", () => {
  it("are all behind the constant, so a build with the flag off draws and loads none of them", () => {
    expect(read("src/routes/profile.tsx")).toMatch(/PREMIUM_SURFACES\s*\?\s*lazy\(/);
    expect(curva("CurvaCardPage.tsx")).toContain("PREMIUM_SURFACES ? <PlusEntryRows />");
    expect(curva("HeadToHeadSheet.tsx")).toMatch(
      /PlusDuelSlot\s*=\s*PREMIUM_SURFACES\s*\?\s*lazy\(/,
    );
    expect(curva("CurvaCardPage.tsx")).toMatch(
      /PlusSeasonSlot\s*=\s*PREMIUM_SURFACES\s*\?\s*lazy\(/,
    );
    for (const slot of ["PlusHomeSeasonSlot", "PlusHomeDuelSlot", "PlusHomeMemberSlot"]) {
      expect(curva("CurvaHome.tsx")).toMatch(
        new RegExp(`${slot}\\s*=\\s*PREMIUM_SURFACES\\s*\\?\\s*lazy\\(`),
      );
    }
    expect(read("src/components/shell/TopBar.tsx")).toMatch(
      /PlusHeaderLogo\s*=\s*PREMIUM_SURFACES\s*\?\s*lazy\(/,
    );
    expect(curva("CurvaHome.tsx")).toMatch(
      /PREMIUM_SURFACES \? \([\s\S]*?<PlusRenewalReminder \/>/,
    );
  });
});
