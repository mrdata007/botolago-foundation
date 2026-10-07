import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { AuthProvider } from "@/auth/AuthProvider";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { Route as RulesRoute } from "./fantasy.rules";

/**
 * BG-0155 (5) — the rules page as it renders with a ruleset in hand: the
 * scoring table, the transfers sentence and the chips card, all from the
 * server's lists (here mock mode's v1 ruleset, which
 * `fantasy-runtime.rules.test.ts` holds to the migration). Rendered with
 * `react-dom/server` inside the app's providers, the query already answered.
 */

const fr = dictionaries.fr;
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
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const decode = (html: string) =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ""));
/** The text a sighted reader sees: screen-reader-only spans removed. */
const visible = (html: string) => text(html.replace(/<span class="sr-only">[^<]*<\/span>/g, ""));
const cells = (rowHtml: string) =>
  [...rowHtml.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => visible(m[2]));

describe("the rules page with the v1 ruleset", () => {
  test("draws the scoring table: one row per event, one column per position", async () => {
    const html = await render(await fantasyService.getRules());
    const table = /<table[\s\S]*?<\/table>/.exec(html)?.[0] ?? "";
    expect(table).toContain(`<caption class="text-start sr-only">${fr["fantasy.rules.scoring"]}`);
    const [head, ...body] = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    expect(cells(head)).toEqual(["Action", "GB", "DEF", "MIL", "ATT"]);
    expect(body.map(cells)).toEqual([
      ["Moins de 60 min jouées", "1", "1", "1", "1"],
      ["60 min ou plus", "2", "2", "2", "2"],
      ["But", "10", "6", "5", "4"],
      ["Passe décisive", "3", "3", "3", "3"],
      ["Cage inviolée", "4", "4", "1", "0"],
      ["Arrêts (tous les 3)", "1", "—", "—", "—"],
      ["Penalty arrêté", "5", "—", "—", "—"],
      ["Buts encaissés (tous les 2)", "−1", "−1", "—", "—"],
      ["Penalty manqué", "−2", "−2", "−2", "−2"],
      ["Carton jaune", "−1", "−1", "−1", "−1"],
      ["Carton rouge direct", "−3", "−3", "−3", "−3"],
      ["Expulsion sur second jaune (total)", "−3", "−3", "−3", "−3"],
      ["But contre son camp", "−2", "−2", "−2", "−2"],
    ]);
  });

  test("names each event as a row header and each position in full for a screen reader", async () => {
    const html = await render(await fantasyService.getRules());
    expect(html.match(/<th scope="row"/g)).toHaveLength(13);
    for (const group of ["GK", "DEF", "MID", "FWD"] as const) {
      expect(html).toContain(`<span class="sr-only">${fr[`fpl.group.${group}`]}</span>`);
    }
    // A dash is drawn for the eye and spoken as words.
    expect(html).toContain(
      `<span aria-hidden="true" class="text-[color:var(--ui-on-surface-muted)]">—</span><span class="sr-only">${fr["fantasy.rules.table_na"].replace("'", "&#x27;")}</span>`,
    );
    // A penalty keeps its sign in front of the number in Arabic too.
    expect(html).toContain('<bdi dir="ltr" class="text-[color:var(--ui-negative)]">−3</bdi>');
  });

  test("states the transfers from the ruleset's own numbers", async () => {
    const html = await render(await fantasyService.getRules());
    expect(text(html)).toContain(
      "1 transfert gratuit par journée, cumulable jusqu'à 2. Chaque transfert supplémentaire coûte 4 points.",
    );
  });

  test("lists the four chips, what each does and how often it can be played", async () => {
    const html = await render(await fantasyService.getRules());
    const page = text(html);
    // The Joker says how many uses, never the ruleset's rounds: the server
    // plays it in the season's own halves (wildcard_split_gameweek), which
    // api.fantasy_rules does not report.
    expect(page).toContain(
      `${fr["fantasy.chip.wildcard"]}${fr["fantasy.chip.wildcard_desc"]}${fr["fantasy.rules.chip_uses_twice"]}`,
    );
    expect(page).not.toContain("J15");
    expect(page).not.toContain("J16");
    // Every other chip: one use, in a round of the manager's choosing.
    for (const chip of ["triple_captain", "free_hit", "bench_boost"] as const) {
      expect(page).toContain(
        `${fr[`fantasy.chip.${chip}`]}${fr[`fantasy.chip.${chip}_desc`]}${fr["fantasy.rules.chip_window_season"]}`,
      );
    }
    expect(fr["fantasy.rules.chip_window_season"]).toBe("Une fois, à la journée de votre choix");
  });

  test("says under the table that a clean sheet and goals conceded count only from 60 minutes", async () => {
    const page = text(await render(await fantasyService.getRules()));
    expect(page).toContain(
      "Cage inviolée et buts encaissés : comptent seulement à partir de 60 min jouées.",
    );
  });

  test("keeps every existing card, in order, with the chips after transfers", async () => {
    const html = await render(await fantasyService.getRules());
    const headings = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => text(m[1]));
    expect(headings).toEqual([
      fr["fantasy.rules.squad"],
      fr["fantasy.rules.budget"],
      fr["fantasy.rules.formation"],
      fr["fantasy.rules.captaincy"],
      fr["fantasy.rules.transfers_r"],
      fr["fantasy.rules.chips"],
      fr["fantasy.rules.deadlines"],
      fr["fantasy.rules.scoring"],
      fr["fantasy.rules.tiebreak"],
      fr["fantasy.rules.policy_title"],
    ]);
    expect(html).toContain('id="scoring-policy"');
  });
});

describe("the rules page without a scoring scale", () => {
  test("says the scale is unavailable in one plain line and draws no table", async () => {
    const rules = await fantasyService.getRules();
    for (const empty of [
      { ...rules, scoring: [] },
      { ...rules, positions: [] },
    ]) {
      const html = await render(empty);
      expect(html).not.toContain("<table");
      expect(text(html)).toContain(fr["fantasy.rules.scoring_unavailable"]);
    }
  });

  test("leaves the chips card out when the ruleset allocates none", async () => {
    const html = await render({ ...(await fantasyService.getRules()), chips: [] });
    expect(text(html)).not.toContain(fr["fantasy.rules.chips"]);
  });
});

describe("the rules copy", () => {
  test("no longer gives a goalkeeper's goal 6 points, in either language", () => {
    for (const dictionary of [fr, ar]) {
      for (const value of Object.values(dictionary)) {
        expect(value).not.toContain("défenseur ou gardien : 6 pts");
        expect(value).not.toContain("مدافع أو حارس: 6 نقاط");
      }
    }
  });

  test("the transfers sentence and the row labels carry the same slots in both languages", () => {
    const slots = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
      if (!key.startsWith("fantasy.rules.")) continue;
      expect(ar[key]).toBeTruthy();
      expect(slots(ar[key])).toEqual(slots(fr[key]));
    }
    expect(slots(fr["fantasy.rules.transfers_rule"])).toEqual(["free", "hit", "max"]);
  });
});
