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
 * « Mon abonnement » in Profil for a complimentary grant, and the way back to Standard for a
 * former member. The two hooks the section reads are stood in; the rest is the real markup.
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
    startCheckout: async () => ({ status: "soon" }),
    cancel: async () => ({ status: "soon" }),
    restore: async () => ({ status: "soon" }),
  }),
  usePremiumReceipts: () => [],
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

const grant = (state: "active" | "expired"): MyPremium => ({
  available: true,
  state,
  productCode: null,
  source: "grant",
  currentPeriodEnd: "2026-12-31T00:00:00Z",
  cancelAtPeriodEnd: false,
});
const holo = (): CardProfile => ({ ...fromMyCard(FIXTURES.rated.card!), edition: "holo" });

describe("a complimentary grant in Profil", () => {
  it("reads as a member: the grant line, the status, the end date and the four rows", async () => {
    mine = grant("active");
    card = holo();
    const html = await render(<PlusProfileSection />);
    const visible = text(html);
    expect(visible).toContain("Offert par l'équipe");
    expect(visible).toContain("Actif");
    expect(visible).toContain("Jusqu'au");
    for (const id of ["season", "duels", "style", "manage"]) {
      expect(html).toContain(`data-testid="plus-hub-${id}"`);
    }
    expect(html).not.toContain("plus-former-style");
    expect(html).not.toContain("/curva/plus");
  });

  it("has the Arabic wording too", () => {
    expect(dictionaries.ar["plus.hub.grant_name"]).toBe("هدية من الفريق");
    expect(dictionaries.fr["plus.hub.grant_name"]).toBe("Offert par l'équipe");
  });
});

describe("a former member whose card keeps a paid style", () => {
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
