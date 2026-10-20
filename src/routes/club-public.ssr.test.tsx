import { afterEach, expect, test } from "bun:test";
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { Route } from "./clubs.$clubId";
import { SSR_DEHYDRATE_OPTIONS } from "@/lib/ssr-prefetch";

const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
});
type Load = (input: {
  params: { clubId: string };
  deps: { tab?: string; season?: string };
  context: { queryClient: QueryClient };
}) => Promise<unknown>;
const load = Route.options.loader as unknown as Load;
const id = "00000010-0000-4000-8000-000000000001";
for (const tab of [undefined, "matches", "standings", "squad"]) {
  test(`club ${tab ?? "overview"} prefetches its actual public content`, async () => {
    const c = new QueryClient();
    clients.push(c);
    const result = await load({
      params: { clubId: id },
      deps: { tab },
      context: { queryClient: c },
    });
    expect(result).toMatchObject({ club: { id }, unavailable: false });
    const snapshot = dehydrate(c, SSR_DEHYDRATE_OPTIONS);
    const matches = snapshot.queries.find((q) => q.queryKey[1] === "club-matches");
    expect(matches).toBeDefined();
    const standings = snapshot.queries.find((q) => q.queryKey[1] === "standings");
    expect(standings).toBeDefined();
    const squad = snapshot.queries.find((q) => q.queryKey[1] === "club-squad");
    expect(!!squad).toBe(tab === "squad");
    if (squad) expect((squad.state.data as unknown[]).length).toBeGreaterThan(0);
    const browser = new QueryClient();
    clients.push(browser);
    hydrate(browser, snapshot);
    expect(browser.getQueryData(matches!.queryKey)).toEqual(matches!.state.data);
    expect(
      snapshot.queries.some((q) => /owned|profile|saved|follow/.test(JSON.stringify(q.queryKey))),
    ).toBe(false);
  });
}
