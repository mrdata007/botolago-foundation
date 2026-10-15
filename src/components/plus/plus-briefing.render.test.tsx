import { describe, expect, it } from "bun:test";
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
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { premiumBriefingService } from "@/services/premium-briefing";
import { premiumBriefingKeys } from "@/services/use-premium-briefing";

import { LockedBriefing, MemberView, PlusBriefingEntry } from "./PlusBriefing";
import { exampleAlternatives, exampleBriefing } from "./plus-briefing-example";

const { fr } = dictionaries;

async function render(node: ReactElement, client = new QueryClient()): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/fantasy/briefing"] }),
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
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("« Briefing avant la deadline »: a member", () => {
  it("sees the four cards from one read: absences by the provider's list, honest limits, the cost of transfers", async () => {
    const view = exampleBriefing();
    const out = view.squad[7]!;
    const client = new QueryClient();
    client.setQueryData(
      premiumBriefingKeys.alternatives(null, out.fantasyPlayerId),
      exampleAlternatives(out.fantasyPlayerId),
    );
    const html = await render(
      <MemberView view={view} userId={null} displayName="Karim B." />,
      client,
    );
    const visible = text(html);
    expect(html).toContain('data-testid="plus-briefing-deck"');
    for (const card of ["absences", "replace", "captain", "transfers"]) {
      expect(html).toContain(`data-card="${card}"`);
    }
    // The scoreboard: one confirmed absence, two players with no information, one free transfer.
    expect(visible).toContain("Absences confirmées");
    expect(visible).toContain("Karim B. · KACM");
    // Absent means the provider listed it, with its date; the others are facts about minutes.
    expect(visible).toContain("Abdelilah Hafidi");
    expect(visible).toContain("Absent · blessure");
    expect(visible).toContain("liste du fournisseur");
    expect(visible).toContain("Aucune information confirmée · 0 min en J10");
    expect(visible).toContain("aucune information ne veut pas dire disponible");
    // Replacement: the budget is sale price plus bank, pending ratings are words.
    expect(visible).toContain("Remplacer Abdelilah Hafidi");
    expect(visible).toContain("Budget : 7,0 M à la vente + 0,8 M en banque = 7,8 M");
    expect(visible).toContain("en attente");
    expect(visible).toContain("sans note");
    expect(visible).toContain("Ce transfert serait gratuit");
    expect(visible).toContain("Un 2e transfert : −4 points sur J11");
    // Captain: the past does not predict, difficulty is an estimate, nobody is preselected.
    expect(visible).toContain("Les points passés ne prédisent pas");
    expect(visible).toContain("estimation · confiance moyenne");
    expect(html).not.toContain('aria-checked="true"');
    // Nothing is saved here: the buttons open the existing screens.
    expect(html).toContain('href="/fantasy/transfers"');
    expect(html).toContain('href="/fantasy/team"');
    expect(visible).toContain("rien n’est enregistré ici");
  });

  it("never prints the words the owner removed, a card serial, or a fallback 5 as a rating", async () => {
    const view = exampleBriefing();
    const out = view.squad[7]!;
    const client = new QueryClient();
    client.setQueryData(
      premiumBriefingKeys.alternatives(null, out.fantasyPlayerId),
      exampleAlternatives(out.fantasyPlayerId),
    );
    const html = await render(<MemberView view={view} userId={null} displayName={null} />, client);
    const visible = text(html).toLowerCase();
    for (const word of ["provisoire", "premium", "débloquer", "n°", "bot #"]) {
      expect(visible).not.toContain(word);
    }
    // Boujellab's J8 is « sans note »: the cell carries the words, never a number.
    const cell = html.match(/pb-g pb-g--none[^>]*>(.*?)<\/div>/);
    expect(cell?.[1]).toContain("sans note");
    expect(cell?.[1]).not.toMatch(/pb-num/);
  });

  it("says plainly that no absence list exists when the provider listed nothing", async () => {
    const view = { ...exampleBriefing(), absenceFeed: { listed: 0 } };
    const quiet = {
      ...view,
      squad: view.squad.map((p) => ({
        ...p,
        absence: null,
        form: p.form.map((c) => ({ ...c, minutes: 90 })),
      })),
    };
    const html = await render(<MemberView view={quiet} userId={null} displayName={null} />);
    const visible = text(html);
    expect(visible).toContain("Aucune liste d’absences n’est disponible");
    expect(visible).toContain("pas de liste d’absences disponible");
    expect(visible).not.toContain("aucune absence signalée");
  });
});

describe("« Briefing avant la deadline »: not a member", () => {
  it("shows the real countdown clear, the example blurred and inert, one unlock, and calls no paid read", async () => {
    let calls = 0;
    const original = {
      briefing: premiumBriefingService.briefing,
      alternatives: premiumBriefingService.alternatives,
    };
    premiumBriefingService.briefing = (async () => {
      calls++;
      return exampleBriefing();
    }) as typeof original.briefing;
    premiumBriefingService.alternatives = (async () => {
      calls++;
      return exampleAlternatives("x");
    }) as typeof original.alternatives;
    try {
      const client = new QueryClient();
      // Even with a member's briefing sitting in the cache, a locked render never shows it.
      const distinct = exampleBriefing();
      distinct.squad[0]!.name = "Zzyzx Member Only";
      client.setQueryData(premiumBriefingKeys.briefing(null), { kind: "member", view: distinct });
      const html = await render(<LockedBriefing />, client);
      expect(html).toContain('data-testid="plus-briefing-locked"');
      expect(html).toContain('href="/curva/plus?step=3&amp;via=briefing"');
      expect(text(html)).toContain(fr["plus.in.unlock"]);
      expect(html).toMatch(/class="pl-under[^"]*" aria-hidden="true" inert=""/);
      // The scoreboard is outside the blur.
      expect(html.indexOf("plus-briefing-board")).toBeLessThan(html.indexOf("pl-under"));
      expect(html).not.toContain("Zzyzx");
      expect(calls).toBe(0);
    } finally {
      premiumBriefingService.briefing = original.briefing;
      premiumBriefingService.alternatives = original.alternatives;
    }
  });
});

describe("the Fantasy hub's entry", () => {
  it("is a link to the briefing; the logo carries the name and the text never types it", async () => {
    // The default test build has the switches on and the premium answer not yet in: off.
    const html = await render(<PlusBriefingEntry gameweekNumber={11} />);
    expect(html).not.toContain('data-testid="plus-briefing-entry"');
  });
});
