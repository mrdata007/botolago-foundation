import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { TopBar } from "./TopBar";

/**
 * Search is one tap away on every primary screen (mobile UX refinements,
 * batch 1): the bar's search button is the bar's, not the desktop-width
 * variant's. It used to render only for `wide`, which is Home and the match
 * page, so Matches, Standings, News and the Fantasy hub had no search.
 */

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/matches"] }),
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

const label = dictionaries.fr["nav.search.label"];
const searchButtons = (html: string) =>
  [...html.matchAll(/<button[^>]*aria-label="([^"]*)"[^>]*>/g)].filter(
    (button) => button[1] === label,
  );

describe("TopBar search", () => {
  it("is in the bar whatever the shell's width", async () => {
    for (const wide of [false, true]) {
      const html = await render(<TopBar wide={wide} />);
      expect(searchButtons(html)).toHaveLength(1);
    }
  });

  it("is closed until it is asked for, and says so", async () => {
    const html = await render(<TopBar />);
    expect(searchButtons(html)[0]![0]).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="combobox"');
  });

  it("only the desktop-width bar carries the inline field, so a narrow bar is not crowded", async () => {
    expect(await render(<TopBar wide />)).toContain('role="search"');
    expect(await render(<TopBar />)).not.toContain('role="search"');
  });

  it("keeps the wordmark, and gives way to its GO mark only when the buttons need the room", async () => {
    const html = await render(<TopBar />);
    // Both are in the markup; which one shows is the bar's width in rem.
    expect(html).toContain("@min-[20rem]:flex");
    expect(html).toContain("@min-[20rem]:hidden");
    expect(html).toMatch(/alt="BotolaGO"/);
  });
});
