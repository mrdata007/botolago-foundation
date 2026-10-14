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

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import type { TransferPreviewPanel } from "@/services/transfers-service";
import { TransferPreviewNotice } from "./TransferPreviewNotice";

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
    expect(text(html)).toContain("il manque 0,1 M");
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
