import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PREMIUM_STATES } from "@/backend/premium/admin";
import { ADMIN_CONSOLE_NAV_ITEMS } from "@/backend/admin/admin-console-contracts";

import * as copy from "./plus-presentation";

/**
 * The owner's rule: « BotolaGO+ » is never typed as text on a screen (only the logo is drawn).
 * This checks everything the admin screen can print: its copy tables, its source, the nav chip.
 */
const BRAND = "BotolaGO+";

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) strings(v, out);
  return out;
}

describe("no typed brand name on the admin screen", () => {
  test("the copy tables and generated labels carry none", () => {
    const tables = Object.values(copy).filter((v) => typeof v === "object");
    expect(strings(tables).filter((s) => s.includes(BRAND))).toEqual([]);
    for (const code of ["plus_monthly", "plus_yearly", "other"]) {
      for (const lang of ["fr", "ar"] as const) {
        expect(copy.productName(code, lang)).not.toContain(BRAND);
      }
    }
    for (const state of PREMIUM_STATES)
      expect(copy.recordedStateLabel(state, "fr")).not.toContain(BRAND);
  });

  test("the nav chip carries none", () => {
    const plus = ADMIN_CONSOLE_NAV_ITEMS.find((item) => item.route === "/admin/plus");
    expect(plus?.labels.fr).not.toContain(BRAND);
    expect(plus?.labels.ar).not.toContain(BRAND);
  });

  test("the nav hints carry none", () => {
    for (const item of ADMIN_CONSOLE_NAV_ITEMS) {
      expect(item.hint.fr).not.toContain(BRAND);
      expect(item.hint.ar).not.toContain(BRAND);
    }
  });

  test("no string literal or JSX text in the screen sources types it", () => {
    const files = [
      ...readdirSync(__dirname)
        .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
        .map((f) => join(__dirname, f)),
      join(__dirname, "../../../routes/admin.plus.tsx"),
      join(__dirname, "../../../routes/dev.admin-shell-sample.tsx"),
      join(__dirname, "../AdminShell.tsx"),
      join(__dirname, "../../../backend/premium/admin-sample.ts"),
    ];
    for (const file of files) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");
      expect({ file, typed: code.includes(BRAND) }).toEqual({ file, typed: false });
    }
  });
});

describe("nothing staff reads names a migration or a product code", () => {
  test("the screen source shows no migration number and does not print a product code", () => {
    const code = readFileSync(join(__dirname, "PlusAdminScreen.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toMatch(/\d{8,}/);
    expect(code).not.toMatch(/migration/i);
    expect(code).not.toContain("product.code}</AdminDatum>");
    expect(code).not.toContain("Interrupteurs");
  });
});
