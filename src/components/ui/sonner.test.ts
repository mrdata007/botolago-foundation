import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries } from "@/i18n/dictionaries";

/**
 * sonner names the toasts' landmark "Notifications" and a toast's close
 * button "Close toast", in English whatever the page's language. The
 * Toaster names both from the dictionaries instead. Source-shape, because in
 * French the landmark's name is the same word either way.
 */
const source = readFileSync(join(import.meta.dir, "sonner.tsx"), "utf8");

describe("the Toaster's accessible names", () => {
  it("come from the dictionaries, not from sonner's English defaults", () => {
    expect(source).toContain('containerAriaLabel={t("toast.region")}');
    expect(source).toContain('closeButtonAriaLabel: t("toast.close")');
  });

  it("exist in both languages", () => {
    for (const lang of ["fr", "ar"] as const) {
      expect(dictionaries[lang]["toast.region"]).toBeTruthy();
      expect(dictionaries[lang]["toast.close"]).not.toMatch(/close toast/i);
    }
  });
});
