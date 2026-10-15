import { afterAll, describe, expect, it, mock } from "bun:test";
import "@/services/__test-shim";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { clubs } from "@/mocks/data";
import { fantasyPlayers } from "@/mocks/fantasy-data";
import type { Language } from "@/types/domain";

/**
 * LOC-03: the headline of the transfer review agrees with the number of
 * transfers. The server render is French (the language arrives after mount),
 * so this file stands in for `useI18n` and answers in the language under test.
 * The module is put back once the file is done (`src/test-isolation.test.ts`).
 */

const realI18n = { ...(await import("@/i18n/provider")) };

let language: Language | null = null;

mock.module("@/i18n/provider", () => ({
  ...realI18n,
  useI18n: () => {
    const real = realI18n.useI18n();
    if (language === null) return real;
    const dictionary = dictionaries[language];
    return {
      ...real,
      lang: language,
      dir: language === "ar" ? "rtl" : "ltr",
      t: (key: TranslationKey) => dictionary[key],
    };
  },
}));
afterAll(() => {
  language = null;
  mock.module("@/i18n/provider", () => realI18n);
});

const { I18nProvider } = await import("@/i18n/provider");
const { TransferConfirmScreen } = await import("./TransferConfirmScreen");

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/fantasy/transfers"] }),
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

const decode = (html: string) =>
  html
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
/** The visible text, without the isolation marks around numbers. */
const text = (html: string) =>
  decode(html.replace(/<[^>]+>/g, " "))
    .replace(/[⁦-⁩]/g, "")
    .replace(/\s+/g, " ");

async function review(count: number, lang: Language): Promise<string> {
  language = lang;
  const outs = fantasyPlayers.filter((p) => p.position === "FWD");
  const ins = fantasyPlayers.filter((p) => p.position === "MID");
  const pairs = Array.from({ length: count }, (_, i) => ({
    out: outs[i % outs.length]!,
    in: ins[i % ins.length]!,
  }));
  return text(
    await render(
      <TransferConfirmScreen
        pairs={pairs}
        clubs={clubs}
        gameweek={3}
        deadlineIso="2099-10-02T14:30:00Z"
        freeUsed={1}
        paidUsed={0}
        hitPoints={0}
        bankAfter={0.2}
        chips={[]}
        onEdit={() => {}}
        onConfirm={() => {}}
      />,
    ),
  );
}

describe("the transfer review's headline (LOC-03)", () => {
  it("Arabic uses the dual for two transfers", async () => {
    const body = await review(2, "ar");
    expect(body).toContain("ستُجري انتقالين.");
    expect(body).not.toContain("2 انتقالات");
  });

  it("Arabic uses the plural for three and the singular for eleven", async () => {
    expect(await review(3, "ar")).toContain("ستُجري 3 انتقالات.");
    expect(await review(11, "ar")).toContain("ستُجري 11 انتقالًا.");
  });

  it("French says one transfer for one and the count otherwise", async () => {
    expect(await review(1, "fr")).toContain("Vous allez effectuer 1 transfert.");
    expect(await review(2, "fr")).toContain("Vous allez effectuer 2 transferts.");
  });
});
