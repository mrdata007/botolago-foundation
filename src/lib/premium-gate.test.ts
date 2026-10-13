import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PREMIUM_BUILD, PREMIUM_PREVIEW, PREMIUM_SURFACES } from "./feature-flags";
import { shouldRedirectFromPlus } from "./premium-gate";

const root = join(import.meta.dir, "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("the BotolaGO+ build flag", () => {
  it("ships off", () => {
    expect(read("src/lib/feature-flags.ts")).toMatch(/export const PREMIUM_BUILD = false;/);
    expect(PREMIUM_BUILD).toBe(false);
  });
  it("has no development preview outside a development server", () => {
    // Under the test runner `import.meta.env.DEV` is not true, so the preview is off too.
    expect(PREMIUM_PREVIEW).toBe(false);
    expect(PREMIUM_SURFACES).toBe(false);
  });
  it("sends every BotolaGO+ address away while the build is off, and none while it is on", () => {
    expect(shouldRedirectFromPlus()).toBe(true);
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
    expect(read("src/components/curva/CurvaCardPage.tsx")).toContain(
      "PREMIUM_SURFACES ? <PlusEntryRows />",
    );
    expect(read("src/components/curva/HeadToHeadSheet.tsx")).toContain(
      "PREMIUM_SURFACES ? <PlusDuelEntry />",
    );
    expect(read("src/components/curva/CurvaHome.tsx")).toContain(
      "PREMIUM_SURFACES ? <PlusRenewalReminder />",
    );
  });
});
