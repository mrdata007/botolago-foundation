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
import type { GameweekRecap } from "@/services/gameweek-recap";
import { GameweekRecapCard } from "./GameweekRecapCard";
import { lineRuns } from "./recap-image";

const fr = dictionaries.fr;

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/fantasy/points"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  )
    .replace(/<!-- -->/g, "")
    .replace(/[⁦-⁩]/g, "");
}

const RECAP: GameweekRecap = {
  gameweek: 9,
  teamName: "Atlas XI",
  total: 58,
  corrected: false,
  calculationVersion: 3,
  finalizedAt: "2026-10-03T22:00:00Z",
  reconciled: true,
  captain: { playerId: "p1", points: 8, multiplier: 2, counted: 16, viceTookOver: false },
  transferHit: 4,
  chipType: null,
  topContributor: { playerId: "p1", counted: 16 },
};
const names: Record<string, string> = { p1: "Rahimi" };

const card = (recap: GameweekRecap) =>
  render(
    <GameweekRecapCard
      recap={recap}
      nameOf={(id) => names[id] ?? id}
      currentGameweek={null}
      onShowDetail={() => {}}
    />,
  );

describe("GameweekRecapCard", () => {
  it("shows the final total, the captain's counted points and the transfer cost", async () => {
    const html = await card(RECAP);
    expect(html).toContain(fr["fantasy.recap.title"]);
    expect(html).toContain("Journée 9 · Résultat final");
    expect(html).toContain("Atlas XI");
    expect(html).toContain(">58<");
    expect(html).toContain("Capitaine Rahimi : 8 × 2 = 16 pts");
    expect(html).toContain("Transferts supplémentaires : −4 pts");
    expect(html).toContain("Rahimi a rapporté le plus de points : 16 pts");
    expect(html).toContain(fr["fantasy.recap.detail"]);
  });

  it("a corrected result says so", async () => {
    const html = await card({ ...RECAP, corrected: true });
    expect(html).toContain("Résultat corrigé");
    expect(html).toContain(fr["fantasy.recap.corrected_note"]);
  });

  it("figures that do not add up show the total and point to the detail, nothing else", async () => {
    const html = await card({
      ...RECAP,
      reconciled: false,
      captain: null,
      transferHit: 0,
      topContributor: null,
    });
    expect(html).toContain(">58<");
    expect(html).toContain(fr["fantasy.recap.unreconciled"]);
    expect(html).not.toContain("Capitaine");
    expect(html).not.toContain("Transferts supplémentaires");
  });

  it("the share message describes a link to BotolaGO, not a public copy of the recap", () => {
    expect(fr["fantasy.recap.share_message"]).toContain("Crée ton équipe sur BotolaGO");
    expect(dictionaries.ar["fantasy.recap.share_message"]).toContain("BotolaGO");
  });
});

describe("recap image lines", () => {
  it("split a sum and a signed figure into left-to-right runs", () => {
    expect(lineRuns("القائد ⁨رحيمي⁩: ⁦8 × 2 = 16⁩ ن")).toEqual([
      { text: "القائد رحيمي: ", ltr: false },
      { text: "8 × 2 = 16", ltr: true },
      { text: " ن", ltr: false },
    ]);
    expect(lineRuns("Transferts : ⁦−4⁩ pts")).toEqual([
      { text: "Transferts : ", ltr: false },
      { text: "−4", ltr: true },
      { text: " pts", ltr: false },
    ]);
    expect(lineRuns("plain")).toEqual([{ text: "plain", ltr: false }]);
  });
});
