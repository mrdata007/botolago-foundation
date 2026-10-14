import { describe, expect, it } from "bun:test";

import { SIG_BOX, fitSignature, initialsOf, scriptOf, signatureName, tableEm } from "./name";

const fit = (name: string) => fitSignature(name, tableEm);

describe("the autograph's name", () => {
  it("follows the name's script, not the interface's", () => {
    expect(scriptOf("Sami")).toBe("latin");
    expect(scriptOf("سامي")).toBe("arabic");
    expect(scriptOf("Karim كريم")).toBe("arabic");
  });

  it("drops control, direction and emoji characters, tatweel and harakat, and collapses spaces", () => {
    expect(signatureName("  Ka‮rim   B. ⚽️ ")).toBe("Ka rim B.");
    expect(signatureName("مُحَمَّـد")).toBe("محمد");
    expect(signatureName("")).toBe("");
  });

  it("keeps at most 48 characters, cut at a word", () => {
    const long = "Abdelkarim Benjelloun-Alaoui El Fassi Ben Mohammed Ould Sidi";
    const cut = signatureName(long);
    expect(cut.length).toBeLessThanOrEqual(48);
    expect(long.startsWith(cut)).toBe(true);
    expect(long[cut.length]).toBe(" ");
  });

  it("takes the first letter of the first two words for the monogram, capitals in Latin", () => {
    expect(initialsOf("karim benali")).toBe("KB");
    expect(initialsOf("Sami")).toBe("S");
    expect(initialsOf("كريم ب.")).toBe("كب");
    expect(initialsOf("10 Hakimi")).toBe("H");
    expect(initialsOf("")).toBe("");
  });
});

describe("the fit", () => {
  it("writes a short name on one line at the largest size", () => {
    expect(fit("Sami")).toEqual({ lines: ["Sami"], script: "latin", size: 30 });
    expect(fit("سامي")!.size).toBe(24);
  });

  it("shrinks a longer name on one line to the art's width", () => {
    const f = fit("Karim Benali")!;
    expect(f.lines).toEqual(["Karim Benali"]);
    expect(f.size).toBeLessThan(30);
    expect((tableEm("Karim Benali", "latin") + 0.36) * f.size).toBeLessThanOrEqual(SIG_BOX + 0.01);
  });

  it("breaks a name too long for one line at the word that balances the lines", () => {
    const f = fit("Abdelkarim Benjelloun-Alaoui")!;
    expect(f.lines).toEqual(["Abdelkarim", "Benjelloun-Alaoui"]);
    const g = fit("عبد الرحمن بن جلون العلوي الإدريسي الحسني")!;
    expect(g.lines).toHaveLength(2);
    expect(g.script).toBe("arabic");
  });

  it("keeps a single long word on one line, shrunk", () => {
    const f = fit("Abdelkarimbenjellounalaoui")!;
    expect(f.lines).toHaveLength(1);
    expect(f.size).toBeGreaterThanOrEqual(6);
  });

  it("has nothing to write for an empty name", () => {
    expect(fit("")).toBeNull();
    expect(fit("   ")).toBeNull();
  });
});
