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
import { FantasyOwnedProvider } from "@/services/fantasy-owned-provider";
import { I18nProvider } from "@/i18n/provider";

import { PlusDuelSlot } from "./PlusDuelSlot";
import { PlusSeasonSlot } from "./PlusSeasonSlot";
import type { PeopleRow } from "./people";

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AuthProvider>
          <FantasyOwnedProvider>{node}</FantasyOwnedProvider>
        </AuthProvider>
      ),
    }),
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

const row = (name: string, team: string, score: number, rank: number, own = false): PeopleRow =>
  ({
    standing: {
      managerId: team,
      managerName: name,
      teamName: name,
      rank,
      previousRank: rank,
      gameweekScore: 0,
      totalScore: score,
    },
    card: null,
    own,
    name,
  }) as PeopleRow;

describe("BotolaGO+ slots in Curva, feature off (this build)", () => {
  it("the card page's « Votre saison » renders nothing and asks for nothing", async () => {
    const html = await render(<PlusSeasonSlot />);
    expect(html).not.toContain("plus-");
    expect(html).not.toContain("pl-");
  });
  it("the face-a-face's « Detail du duel » renders nothing", async () => {
    const html = await render(
      <PlusDuelSlot
        mineRow={row("Moi", "t1", 612, 3, true)}
        row={row("Yassine", "t2", 598, 4)}
        size={5}
      />,
    );
    expect(html).not.toContain("plus-");
  });
});
