import { describe, expect, it } from "bun:test";
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
import { FantasyInviteCard } from "./FantasyInviteCard";

const fr = dictionaries.fr;

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
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

describe("FantasyInviteCard", () => {
  it("invites to the builder with the deadline and the free note", async () => {
    const html = await render(<FantasyInviteCard canCreate deadline="2099-10-30T16:30:00Z" />);
    expect(html).toContain('data-testid="fantasy-invite"');
    expect(html).toContain(fr["home.invite_title"]);
    expect(html).toContain(fr["fantasy.create.title"]);
    expect(html).toContain('href="/fantasy/create"');
    expect(html).toContain(fr["landing.cta_note"]);
    expect(html).toContain("Date limite : <bdi");
  });

  it("leaves the deadline out when there is none (a passed one leaves on the first client tick)", async () => {
    const none = await render(<FantasyInviteCard canCreate deadline={undefined} />);
    expect(none).not.toContain("Date limite");
  });

  it("leads to the player list when no team can be created now", async () => {
    const html = await render(<FantasyInviteCard canCreate={false} />);
    expect(html).toContain('href="/fantasy/players"');
    expect(html).toContain(fr["fantasy.next.explore"]);
    expect(html).not.toContain('href="/fantasy/create"');
  });
});
