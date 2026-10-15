import { afterAll, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";

import { AuthProvider } from "@/auth/AuthProvider";
import { FIXTURES } from "@/backend/manager-card/fixtures";
import type { MyPremium } from "@/backend/premium/contracts";
import { fromMyCard } from "@/components/manager-card/to-profile";
import type { CardProfile } from "@/components/manager-card/types";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";

/**
 * « Ma saison » in Profil for a Saison held through a grant (staff activate it), its end, and the
 * way back to Standard for a former holder. The two hooks the section reads are stood in; the rest is the real markup.
 */
const realPremium = { ...(await import("@/services/use-premium")) };
const realCard = { ...(await import("./use-plus-member-card")) };

let mine: MyPremium = { available: false };
let card: CardProfile | null = null;
mock.module("@/services/use-premium", () => ({
  ...realPremium,
  usePremium: () => ({
    ready: true,
    ...realPremium.derivePremium({ enabled: true, checkoutEnabled: true, prices: [] }, mine, true),
  }),
}));
mock.module("./use-plus-member-card", () => ({ usePlusMemberCard: () => card }));
afterAll(() => {
  mock.module("@/services/use-premium", () => realPremium);
  mock.module("./use-plus-member-card", () => realCard);
});
const { PlusProfileSection } = await import("./PlusProfileSection");
const { syncDraft } = await import("./PlusStylePicker");

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/profile"] }),
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
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

const grant = (state: "active" | "expired" | "cancelling" | "grace"): MyPremium => ({
  available: true,
  state,
  productCode: "plus_season",
  source: "grant",
  currentPeriodEnd: "2026-12-31T00:00:00Z",
  cancelAtPeriodEnd: false,
});
const holo = (): CardProfile => ({ ...fromMyCard(FIXTURES.rated.card!), edition: "holo" });

describe("a Saison in Profil", () => {
  it("reads « Votre Saison 2026/27 est active · jusqu'au {date} » and the three rows", async () => {
    mine = grant("active");
    card = holo();
    const html = await render(<PlusProfileSection />);
    const visible = text(html);
    expect(visible).toContain("Ma saison");
    expect(visible).toContain("Votre Saison 2026/27 est active · jusqu'au 31 décembre 2026");
    for (const id of ["season", "duels", "style"]) {
      expect(html).toContain(`data-testid="plus-hub-${id}"`);
    }
    expect(html).not.toContain("plus-former-style");
    expect(html).not.toContain("/curva/plus");
  });

  it("offers nothing to cancel, restore, pay again or receive a receipt for", async () => {
    for (const state of ["active", "cancelling", "grace"] as const) {
      mine = grant(state);
      card = holo();
      const html = await render(<PlusProfileSection />);
      const visible = text(html);
      expect(visible).toContain("jusqu'au 31 décembre 2026");
      expect(html).not.toContain("plus-hub-manage");
      expect(html).not.toContain("plus-keep");
      expect(html).not.toContain("plus-pay-update");
      for (const gone of ["Annuler", "Restaurer", "Reçus", "Mettre à jour", "Paiement"]) {
        expect(visible).not.toContain(gone);
      }
    }
  });

  it("says « Votre Saison est terminée » once it is over, with the way to the offer", async () => {
    mine = grant("expired");
    card = holo();
    const html = await render(<PlusProfileSection />);
    const visible = text(html);
    expect(visible).toContain("Votre Saison est terminée");
    expect(visible).toContain("a pris fin le 31 décembre 2026");
    expect(visible).toContain("Voir l'offre");
    expect(html).toContain("/curva/plus");
  });

  it("has the Arabic wording too", () => {
    expect(dictionaries.ar["plus.profile.ended"]).toBe("انتهى موسمك");
    expect(dictionaries.fr["plus.profile.ended"]).toBe("Votre Saison est terminée");
  });
});

describe("a former Saison holder whose card keeps a paid style", () => {
  it("is offered « Style de la carte », and only for a non-standard edition", async () => {
    mine = grant("expired");
    card = holo();
    const html = await render(<PlusProfileSection />);
    expect(html).toContain('data-testid="plus-former-style"');
    expect(html).toContain('data-testid="plus-hub-style"');
    expect(text(html)).toContain("Style de la carte");

    card = fromMyCard(FIXTURES.rated.card!);
    const plain = await render(<PlusProfileSection />);
    expect(plain).not.toContain("plus-former-style");
  });
});

describe("the picker's unsaved pick", () => {
  const draft = { open: true, current: "standard", picked: "holo", failed: true } as const;
  it("starts again from the card's style when the sheet opens or closes", () => {
    expect(syncDraft({ ...draft, open: false }, true, "standard")).toEqual({
      open: true,
      current: "standard",
      picked: "standard",
      failed: false,
    });
    expect(syncDraft(draft, false, "standard").picked).toBe("standard");
  });
  it("keeps the pick while nothing changes", () => {
    expect(syncDraft(draft, true, "standard")).toBe(draft);
  });
});
