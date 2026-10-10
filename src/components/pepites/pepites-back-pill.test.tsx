import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
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
import { MockPepitesRepository } from "@/backend/pepites/mock-repository";
import { I18nProvider } from "@/i18n/provider";

import { PepitesHome } from "./PepitesHome";
import { PepitesPageTitle } from "./PepitesShell";
import { pepitesKeys, rankingStatsQueryOptions } from "./use-pepites";

/**
 * While Curva is live Pépites lives inside Fantasy (plan 3.4), so the home's title band opens
 * with a « Fantasy » back pill. Off, the band is what it was. The live state is the section's own
 * status hook, replaced here for the length of this file.
 */

const status = { live: false };
const original = { ...(await import("@/services/manager-card-status")) };
beforeAll(() => {
  mock.module("@/services/manager-card-status", () => ({
    ...original,
    useManagerCardLive: () => status.live,
  }));
});
afterAll(() => {
  mock.module("@/services/manager-card-status", () => original);
});
afterEach(() => {
  status.live = false;
});

async function render(node: ReactElement, client = new QueryClient()): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/pepites"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

/** What the home reads, seeded the way the browser would hold it. */
async function seeded(source: "edition" | "previous_season"): Promise<QueryClient> {
  const repo = new MockPepitesRepository();
  const context = { actorId: null, requestId: "test" };
  const version = await repo.version(context);
  if (!version.available) throw new Error("the mock has no published version");
  const client = new QueryClient();
  client.setQueryData(pepitesKeys.version("anon"), version);
  const home = await repo.home(version.version, context);
  if (!home.available) throw new Error("the mock has no home");
  const shaped =
    source === "edition"
      ? home
      : {
          ...home,
          source: "previous_season" as const,
          edition: null,
          previousSeason: {
            seasonLabel: "2025/2026",
            entries: home.edition?.entries ?? [],
          },
        };
  client.setQueryData(pepitesKeys.home("anon", version.version), shaped);
  const stats = rankingStatsQueryOptions("anon", version.version);
  client.setQueryData(stats.queryKey, await repo.ranking(stats.queryKey[3] as never, context));
  return client;
}

const pill = (html: string) =>
  /<a [^>]*>(?:(?!<\/a>).)*Fantasy(?:(?!<\/a>).)*<\/a>/s.exec(html)?.[0];

describe("PepitesPageTitle's back pill", () => {
  const title = (props: Record<string, unknown>) =>
    render(<PepitesPageTitle title="Top 10" {...props} />);

  it("keeps « Retour » unless it is given a label", async () => {
    const plain = await title({ backTo: "/pepites" });
    expect(plain).toContain('data-testid="pepites-back"');
    expect(plain).toContain("Retour");
    const named = await title({ backTo: "/fantasy", backLabel: "Fantasy" });
    expect(named).toContain('href="/fantasy"');
    expect(named).not.toContain("Retour");
    expect(pill(named)).toBeDefined();
  });

  it("draws no pill without a destination, label or not", async () => {
    expect(await title({})).not.toContain("pepites-back");
    expect(await title({ backLabel: "Fantasy" })).not.toContain("pepites-back");
  });
});

describe("the Pépites home's title band", () => {
  for (const source of ["edition", "previous_season"] as const) {
    describe(source === "edition" ? "a published edition" : "last season's ranking", () => {
      it("has no back pill with the switch off", async () => {
        const html = await render(<PepitesHome />, await seeded(source));
        expect(html).toContain(
          source === "edition" ? "pepites-edition-title" : "pepites-previous-title",
        );
        expect(html).toContain('data-testid="pepites-section-label"');
        expect(html).not.toContain('data-testid="pepites-back"');
      });

      it("opens with a « Fantasy » back pill to /fantasy, above the PÉPITES label, when live", async () => {
        status.live = true;
        const html = await render(<PepitesHome />, await seeded(source));
        const back = html.indexOf('data-testid="pepites-back"');
        const label = html.indexOf('data-testid="pepites-section-label"');
        expect(back).toBeGreaterThan(0);
        expect(label).toBeGreaterThan(back);
        const link = /<a [^>]*href="\/fantasy"[^>]*>/.exec(html);
        expect(link).not.toBeNull();
        expect(html.slice(back, label)).toContain("Fantasy");
        expect(html.slice(back, label)).not.toContain("Retour");
      });
    });
  }
});
