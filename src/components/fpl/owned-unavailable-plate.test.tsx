import { describe, expect, it } from "bun:test";
import "@/services/__test-shim";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { ownedPlayerFallback } from "@/services/transfers-service";
import { FplPlayerCard } from "./FplPlayerCard";
import { plateName, plateText } from "./plate-name";

/**
 * SOL-02: an owned player the buying pool no longer lists is drawn with a
 * stand-in wording. The pitch plate keeps only the last word of a name, which
 * cut "Joueur retiré du marché" to "marché" and "لاعب خارج السوق" to "السوق".
 */

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/fantasy/transfers"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

describe("the plate of an owned player the pool no longer lists (SOL-02)", () => {
  const record = { id: "gone", clubId: "c", position: "FWD" as const, price: 7.4, status: "x" };

  it("shows the stand-in whole in French and in Arabic, not its last word", () => {
    for (const lang of ["fr", "ar"] as const) {
      const label = dictionaries[lang]["fantasy.transfers.owned_unavailable"];
      const player = ownedPlayerFallback(record, { fr: label, ar: label });
      expect(plateText(label, player.placeholder)).toBe(label);
    }
    // A real name is still cut to its surname.
    expect(plateText("Yahya Attiat-Allah", undefined)).toBe("Attiat-Allah");
  });

  it("is short enough for a plate (about eleven characters)", () => {
    for (const lang of ["fr", "ar"] as const) {
      expect(dictionaries[lang]["fantasy.transfers.owned_unavailable"].length).toBeLessThanOrEqual(
        11,
      );
    }
  });

  it("the card draws the whole wording, which the old plate would have cut", async () => {
    const label = dictionaries.fr["fantasy.transfers.owned_unavailable"];
    const player = ownedPlayerFallback(record, { fr: label, ar: label });
    const html = await render(<FplPlayerCard player={player} />);
    expect(html).toContain(`>${label}</span>`);
    // What the plate used to keep of a multi-word stand-in.
    expect(plateName("Joueur retiré du marché")).toBe("marché");
    expect(plateName("لاعب خارج السوق")).toBe("السوق");
  });
});
