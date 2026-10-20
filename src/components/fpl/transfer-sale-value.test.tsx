import { describe, expect, it } from "bun:test";
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
import { I18nProvider } from "@/i18n/provider";
import type { TransferPreviewPanel } from "@/services/transfers-service";
import { clubs } from "@/mocks/data";
import { fantasyPlayers } from "@/mocks/fantasy-data";
import { TransferConfirmScreen } from "./TransferConfirmScreen";
import { TransferPreviewNotice } from "./TransferPreviewNotice";
import { previewNoticeParts } from "./transfer-preview-copy";

/**
 * FANT-02: the notice the transfers screen shows beside "Suivant", rendered the
 * way the screen renders it (French, `react-dom/server`, inside the app's
 * providers). The money rules behind FANT-01 are in
 * `src/services/transfers-sale-value.test.ts`.
 */

const fr = dictionaries.fr;

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
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

describe("the preview notice (FANT-02)", () => {
  const failed = (
    kind: Extract<TransferPreviewPanel, { state: "failed" }>["issue"]["kind"],
    shortfall: number | null = null,
    retryable = true,
  ): TransferPreviewPanel => ({ state: "failed", issue: { kind, shortfall }, retryable });

  it("renders nothing when there is nothing to say", async () => {
    const html = await render(
      <TransferPreviewNotice panel={{ state: "none" }} onRetry={() => {}} retrying={false} />,
    );
    expect(html).not.toContain("transfer-preview");
  });

  it("says the transfer is being worked out", async () => {
    const html = await render(
      <TransferPreviewNotice panel={{ state: "pending" }} onRetry={() => {}} retrying />,
    );
    expect(html).toContain('data-testid="transfer-preview-pending"');
    expect(text(html)).toContain(fr["fantasy.transfers.preview.pending"]);
  });

  it("names the real shortfall for a budget refusal and offers a retry", async () => {
    const html = await render(
      <TransferPreviewNotice panel={failed("budget", 0.1)} onRetry={() => {}} retrying={false} />,
    );
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("Il manque 0,1 M");
    expect(html).toContain('data-testid="transfer-preview-retry"');
    expect(text(html)).toContain(fr["fantasy.error.retry"]);
  });

  it("does not invent an amount when the shortfall is unknown", async () => {
    const html = await render(
      <TransferPreviewNotice panel={failed("budget")} onRetry={() => {}} retrying={false} />,
    );
    expect(text(html)).toContain(fr["fantasy.transfers.preview.budget_changed"]);
    expect(html).not.toContain("{amount}");
  });

  it("gives each reason its own sentence", async () => {
    const cases: Array<[Parameters<typeof failed>[0], string]> = [
      ["stale", fr["fantasy.transfers.preview.stale"]],
      ["step_up", fr["fantasy.transfers.preview.step_up"]],
      ["network", fr["fantasy.transfers.preview.network"]],
      ["permission", fr["fantasy.error.permission"]],
      ["locked", fr["fantasy.transfers.error.deadline"]],
      ["invalid", fr["fantasy.transfers.preview.invalid"]],
      ["generic", fr["fantasy.transfers.preview.failed"]],
    ];
    for (const [kind, sentence] of cases) {
      const html = await render(
        <TransferPreviewNotice
          panel={failed(kind, null, kind !== "locked")}
          onRetry={() => {}}
          retrying={false}
        />,
      );
      expect(text(html)).toContain(sentence);
    }
  });

  it("isolates only the amount, not the whole sentence, for bidi", async () => {
    const html = await render(
      <TransferPreviewNotice panel={failed("budget", 0.1)} onRetry={() => {}} retrying={false} />,
    );
    expect(html).toContain("<bdi>0,1</bdi>");
    expect(html.match(/<bdi>/g)?.length).toBe(1);
  });

  it("the Arabic wording is in the same shape: Arabic text around an isolated amount", () => {
    const ar = dictionaries.ar;
    const t = (key: TranslationKey) => ar[key];
    const parts = previewNoticeParts({ kind: "budget", shortfall: 0.1 }, t, "٠٫١");
    expect(parts.amount).toBe("٠٫١");
    expect(parts.before).toMatch(/[؀-ۿ]/);
    expect(parts.after).toMatch(/[؀-ۿ]/);
    expect(`${parts.before}${parts.amount}${parts.after}`).not.toContain("{amount}");
    // Every other reason is a whole Arabic sentence with no placeholder left.
    for (const kind of [
      "budget",
      "stale",
      "step_up",
      "network",
      "locked",
      "permission",
      "invalid",
      "generic",
    ] as const) {
      const other = previewNoticeParts({ kind, shortfall: null }, t, "");
      expect(other.amount).toBeNull();
      expect(other.before).toMatch(/[؀-ۿ]/);
      expect(other.before).not.toContain("{");
    }
  });

  it("every new key keeps the same placeholders in French and Arabic", () => {
    const keys = Object.keys(dictionaries.fr).filter((k) =>
      k.startsWith("fantasy.transfers.preview."),
    ) as TranslationKey[];
    expect(keys.length).toBe(8);
    for (const key of keys) {
      const placeholders = (s: string) => (s.match(/\{[a-z_]+\}/g) ?? []).sort().join(",");
      expect(placeholders(dictionaries.ar[key])).toBe(placeholders(dictionaries.fr[key]));
    }
  });

  it("a stale version offers to reload the team; a passed deadline offers no retry", async () => {
    const stale = await render(
      <TransferPreviewNotice panel={failed("stale")} onRetry={() => {}} retrying={false} />,
    );
    expect(text(stale)).toContain(fr["fantasy.error.reload_latest"]);
    const locked = await render(
      <TransferPreviewNotice
        panel={failed("locked", null, false)}
        onRetry={() => {}}
        retrying={false}
      />,
    );
    expect(locked).not.toContain("transfer-preview-retry");
  });

  it("the retry is held while the server is being asked again", async () => {
    const html = await render(
      <TransferPreviewNotice panel={failed("network")} onRetry={() => {}} retrying />,
    );
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*data-testid="transfer-preview-retry"|<button[^>]*data-testid="transfer-preview-retry"[^>]*disabled/,
    );
  });
});

describe("the confirmation shows the owner's sale value for the leaving player (FANT-01)", () => {
  it("out at 7,2 (sale), in at 7,0, not out at 7,4 (market)", async () => {
    const [outPlayer, inPlayer] = fantasyPlayers.filter((p) => p.position === "FWD");
    const html = await render(
      <TransferConfirmScreen
        pairs={[
          { out: { ...outPlayer!, price: 7.4 }, outValue: 7.2, in: { ...inPlayer!, price: 7.0 } },
        ]}
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
    );
    const body = text(html);
    expect(body).toContain("7,2");
    expect(body).toContain("7,0");
    expect(body).not.toContain("7,4");
  });
});
