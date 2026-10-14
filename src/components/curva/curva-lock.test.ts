import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries } from "@/i18n/dictionaries";

import { curvaAccess } from "@/services/curva-access";

import { lockTitleKey } from "./CurvaLockScreen";

const root = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("who may see Curva", () => {
  it("opens for an account, locks for a visitor, waits while the session is unknown", () => {
    expect(curvaAccess("authenticated")).toBe("open");
    expect(curvaAccess("guest")).toBe("locked");
    expect(curvaAccess("anonymous")).toBe("locked");
    expect(curvaAccess("loading")).toBe("pending");
    expect(curvaAccess("mfa_required")).toBe("pending");
    expect(curvaAccess("mfa_unconfirmed")).toBe("pending");
  });
});

describe("the lock sits in the layout, before any Curva page or read", () => {
  const layout = read("src/routes/curva.tsx");
  it("decides before the outlet, whether or not BotolaGO+ exists", () => {
    expect(layout).toContain("curvaAccess(status)");
    expect(layout.indexOf("<CurvaLockScreen />")).toBeLessThan(layout.indexOf("<Outlet />"));
    expect(layout).not.toContain("PREMIUM");
  });
  it("leaves the child routes' meta alone", () => {
    for (const route of ["curva.index", "curva.carte", "curva.les-votres"]) {
      expect(read(`src/routes/${route}.tsx`)).toContain('"robots", content: "noindex"');
    }
  });
});

describe("the lock screen", () => {
  it("names what the visitor wanted", () => {
    expect(lockTitleKey("/curva")).toBe("curva.lock.title.home");
    expect(lockTitleKey("/curva/carte")).toBe("curva.lock.title.card");
    expect(lockTitleKey("/curva/les-votres")).toBe("curva.lock.title.people");
    expect(lockTitleKey("/curva/classement")).toBe("curva.lock.title.ranking");
    expect(lockTitleKey("/curva/plus")).toBe("curva.lock.title.plus");
  });
  it("has French and Arabic text, with the free account said and no banned word", () => {
    for (const lang of ["fr", "ar"] as const) {
      const d = dictionaries[lang];
      for (const key of Object.keys(d).filter((k) => k.startsWith("curva.lock."))) {
        const value = (d as Record<string, string>)[key]!;
        expect(value.length).toBeGreaterThan(0);
        expect(value).not.toMatch(/débloqu|premium|pass\b/i);
      }
    }
    expect(dictionaries.fr["curva.lock.title.home"]).toContain("gratuit");
    expect(dictionaries.ar["curva.lock.title.home"]).toContain("المجاني");
  });
  it("reads nothing: the preview is example data only", () => {
    const source = read("src/components/curva/CurvaLockScreen.tsx");
    expect(source).not.toMatch(/useCurvaScreen|useMyManagerCard|useCurvaPeople|useQuery/);
    expect(source).toContain("SAMPLE_CARD_PROFILE");
    expect(source).toContain("EXAMPLE_VIEW");
  });
});
