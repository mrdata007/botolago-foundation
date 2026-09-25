import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { fr } from "./dictionary-fr";
import { I18nProvider, useI18n } from "./provider";

/**
 * The 404 and error screens wrap themselves in an `I18nProvider` of their
 * own, and under a working root that one sits inside the root's. Two copies
 * of the language state there came apart after a retry of Arabic (review of
 * audit 2026-09-25, A10): the root's switched to Arabic and dismissed the
 * notice, the 404 page's stayed French, and the page read French under
 * `<html lang="ar" dir="rtl">`.
 */

type I18n = ReturnType<typeof useI18n>;

function collect(tree: (Probe: () => null) => ReactElement): I18n[] {
  const seen: I18n[] = [];
  function Probe() {
    seen.push(useI18n());
    return null;
  }
  renderToStaticMarkup(tree(Probe));
  return seen;
}

describe("an I18nProvider inside another", () => {
  it("hands its children the outer one, not a copy of its own", () => {
    const [outer, inner] = collect((Probe) => (
      <I18nProvider>
        <Probe />
        <I18nProvider>
          <Probe />
        </I18nProvider>
      </I18nProvider>
    ));
    expect(inner).toBe(outer);
  });

  it("still stands on its own where there is no outer one (the root itself failed)", () => {
    const [alone] = collect((Probe) => (
      <I18nProvider>
        <Probe />
      </I18nProvider>
    ));
    expect(alone.lang).toBe("fr");
    expect(alone.t("state.retry")).toBe(fr["state.retry"]);
  });
});
