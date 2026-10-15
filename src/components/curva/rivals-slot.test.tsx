import { describe, expect, it } from "bun:test";
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
import { PlusRivals } from "@/components/plus/PlusRivals";
import { I18nProvider } from "@/i18n/provider";

import type { PeopleRow } from "./people";
import { rivalsSlotProps } from "./rivals-slot";

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/curva"] }),
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

const solo = [
  { own: true, name: "Karim B.", standing: { totalScore: 10, rank: 1 } },
] as unknown as PeopleRow[];
const base = { rows: solo, standingsPending: false, standingsError: false };

describe("« Vos rivaux » on the home: what gates what", () => {
  it("a member's board does not depend on the selected league: solo, pending or failed standings still render it", async () => {
    for (const people of [
      base,
      { rows: [], standingsPending: true, standingsError: false },
      { rows: [], standingsPending: false, standingsError: true },
    ]) {
      const props = rivalsSlotProps("member", people);
      expect(props).not.toBeNull();
      expect(props!.closest).toBeNull();
      const html = await render(<PlusRivals {...props!} />);
      // the member surface (its heading, here still loading), not nothing
      expect(html).toContain('data-testid="plus-rivals-loading"');
    }
    expect(rivalsSlotProps("member", base)!.mine?.name).toBe("Karim B.");
  });

  it("the locked preview still needs the standings and a league mate; off is nothing", () => {
    expect(rivalsSlotProps("locked", base)).toBeNull();
    expect(rivalsSlotProps("locked", { ...base, standingsError: true })).toBeNull();
    expect(rivalsSlotProps("off", base)).toBeNull();
  });
});
