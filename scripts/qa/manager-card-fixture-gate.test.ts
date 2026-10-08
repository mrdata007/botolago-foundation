import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MANAGER_CARD_FIXTURE_SENTINEL } from "../../src/backend/manager-card/fixtures";
import { fixtureNeedles, runGate, scanFiles } from "./manager-card-fixture-gate";

function build(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "mc-gate-"));
  for (const [path, text] of Object.entries(files)) {
    const full = join(directory, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  return directory;
}

describe("the Manager Card fixture gate", () => {
  it("looks for the sentinel, the sample names and the fixture URLs", () => {
    const needles = fixtureNeedles();
    expect(needles).toContain(MANAGER_CARD_FIXTURE_SENTINEL);
    for (const name of ["KARIM", "SALMA", "YASMINE", "OTHMANE", "HAMZA", "Les Lions du Derb"]) {
      expect(needles).toContain(name);
    }
    expect(needles).toContain("mc=rated");
    expect(needles).toContain("Abdelkarim Benjelloun-Alaoui");
    // A name that is also an ordinary word would flag every build.
    expect(needles).not.toContain("Ali");
  });

  it("passes a build with none of them", () => {
    const directory = build({
      "public/assets/app.js": 'const a = "rated"; const b = "founder"; export {a,b}',
      "server/index.mjs": "export default {}",
    });
    expect(runGate(directory)).toMatchObject({ code: 0 });
  });

  it("fails a build that carries the sentinel, a sample name or a fixture URL", () => {
    for (const leak of [MANAGER_CARD_FIXTURE_SENTINEL, '{name:"KARIM"}', "?mc=founder"]) {
      const directory = build({ "public/assets/chunk-abc.js": `var x=${JSON.stringify(leak)};` });
      const result = runGate(directory);
      expect(result.code).toBe(1);
      expect(result.message).toContain("chunk-abc.js");
    }
  });

  it("fails without a build rather than passing on nothing", () => {
    expect(runGate(join(tmpdir(), "mc-gate-does-not-exist"))).toMatchObject({ code: 1 });
    expect(runGate(build({ "image.png": "x" }))).toMatchObject({ code: 1 });
  });

  it("scans text and nothing else, and names each finding", () => {
    expect(scanFiles([{ path: "a.js", text: "xx KARIM yy" }], ["KARIM", "SALMA"])).toEqual([
      { path: "a.js", needle: "KARIM" },
    ]);
  });
});
