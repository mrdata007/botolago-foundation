import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { PredictionsStickyBar } from "./PredictionsStickyBar";
import type { PredictionsSaveState } from "./use-predictions-round";

/**
 * The Pronostics bar's save indicator. A save the server refused until the
 * one-time code is in (`step_up`, see `shownSaveState`) used to read "Échec de
 * l'enregistrement" beside the auth layer's "confirm your sign-in with the
 * code": two stories for one refusal, and the first one untrue -- nothing is
 * wrong with the picks, which wait for the code. Rendered with
 * `react-dom/server` in the French dictionary, as the other component tests do.
 */

const fr = dictionaries.fr;
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

function bar(state: PredictionsSaveState): string {
  return renderToString(
    <I18nProvider>
      <PredictionsStickyBar
        done={3}
        total={8}
        state={state}
        onRetry={() => {}}
        onSignUp={() => {}}
      />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

describe("PredictionsStickyBar", () => {
  it("says the code is owed, with a way to send again, not that the save failed", () => {
    const html = bar("step_up");
    expect(html).toContain(escapeHtml(fr["predictions.save.step_up"]));
    expect(html).toContain(escapeHtml(fr["state.retry"]));
    expect(html).not.toContain(escapeHtml(fr["predictions.save.failed"]));
  });

  it("still says a save failed when it did", () => {
    const html = bar("error");
    expect(html).toContain(escapeHtml(fr["predictions.save.failed"]));
    expect(html).toContain(escapeHtml(fr["state.retry"]));
    expect(html).not.toContain(escapeHtml(fr["predictions.save.step_up"]));
  });

  it("keeps the step-up line in the bar's live region", () => {
    const html = bar("step_up");
    const status =
      /<div role="status"[^>]*data-testid="predictions-bar"[^>]*>([\s\S]*)<\/div>/.exec(html);
    expect(status?.[1]).toContain(escapeHtml(fr["predictions.save.step_up"]));
  });
});
