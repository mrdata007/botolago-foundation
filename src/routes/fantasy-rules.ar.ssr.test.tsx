import { afterAll, describe, expect, test, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { AuthProvider } from "@/auth/AuthProvider";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { fantasyService } from "@/services/fantasy-runtime";

/**
 * Audit LOC-01 in Arabic: the rules page's policy card, rendered on the server
 * with both policy objects present. The server always renders French, so
 * `useI18n` answers in Arabic here, the way `RankingView.render.test.tsx` does
 * it; the module is put back once the file is done.
 */
const realI18n = { ...(await import("@/i18n/provider")) };
mock.module("@/i18n/provider", () => ({
  ...realI18n,
  useI18n: () => {
    const real = realI18n.useI18n();
    return {
      ...real,
      lang: "ar" as const,
      dir: "rtl" as const,
      t: (key: TranslationKey) => dictionaries.ar[key],
    };
  },
}));
afterAll(() => {
  mock.module("@/i18n/provider", () => realI18n);
});

const { Route: RulesRoute } = await import("./fantasy.rules");

const ar = dictionaries.ar;
type Rules = Awaited<ReturnType<typeof fantasyService.getRules>>;

async function render(rules: Rules): Promise<string> {
  const client = new QueryClient();
  client.setQueryData(["fantasy-rules"], rules);
  const Page = RulesRoute.options.component!;
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AuthProvider>
          <Page />
        </AuthProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/fantasy/rules"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={client}>
      <realI18n.I18nProvider>
        <RouterProvider router={router} />
      </realI18n.I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const policyCard = (html: string) =>
  text(/<section[^>]*id="scoring-policy"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "");

describe("the rules page policy card in Arabic, both policies present (LOC-01)", () => {
  test("names the rounds before and after, in Arabic numerals, and keeps the safeguards", async () => {
    const rules = await fantasyService.getRules();
    const nf = new Intl.NumberFormat("ar-MA");
    const card = policyCard(
      await render({
        ...rules,
        adaptiveScoring: {
          fromGameweek: 1,
          selectionDelayHours: 12,
          scope: "fixture",
          lateModeUpgrade: false,
        },
        ratingScoring: { fromGameweek: 5, noRatingPoints: 5 },
      }),
    );
    const from = ar["fantasy.scoring.ratingFrom"].replace("{n}", nf.format(5));
    const until = ar["fantasy.scoring.eventUntil"].replace("{n}", nf.format(4));
    expect(from).toBe("ابتداءً من الجولة 5: النقاط حسب تقييم SofaScore.");
    expect(until).toBe("حتى الجولة 4: احتساب النقاط حسب أحداث المباراة.");
    expect(card).toContain(ar["fantasy.rules.policy_title"]);
    expect(card).toContain(ar["fantasy.rules.provisional_desc"]);
    expect(card).toContain(`${from}${ar["fantasy.scoring.ratingSafeguards"]}`);
    expect(card).toContain(`${until}${ar["fantasy.scoring.policy"]}`);
    expect(card.indexOf(from)).toBeLessThan(card.indexOf(until));
  });
});
