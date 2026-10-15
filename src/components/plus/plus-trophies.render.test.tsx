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
import { mockTrophies } from "@/backend/trophies/mock";
import { I18nProvider } from "@/i18n/provider";
import { trophyKeys } from "@/services/use-trophies";

import { PlusTrophiesSection } from "./PlusTrophiesSection";
import { TrophyCabinet } from "./TrophyCabinet";
import { TrophyDetail } from "./TrophyDetail";
import { TrophyFrames } from "./TrophyFrames";
import { buildShelves } from "./trophy-model";

async function render(node: ReactElement, client = new QueryClient()): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/curva"] }),
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
const identity = { name: "Karim B.", club: "KACM", ovr: 72, tier: "STADE" };
function seeded(member: boolean): QueryClient {
  const client = new QueryClient();
  client.setQueryData(trophyKeys.mine(null), mockTrophies("founder_2026", member));
  return client;
}
const noop = () => undefined;

describe("« Trophées » on the card page", () => {
  it("is off: nothing is drawn and nothing is requested", async () => {
    const html = await render(<PlusTrophiesSection access="off" identity={identity} />);
    expect(html).not.toContain("trophy");
    expect(html).not.toContain("plus-trophies");
  });

  it("member: the lit cabinet, the headline with the waiting one, the rule and both buttons", async () => {
    const html = await render(
      <PlusTrophiesSection access="member" identity={identity} />,
      seeded(true),
    );
    const t = text(html);
    expect(html).toContain('data-testid="plus-trophies-member"');
    expect(t).toContain("Karim B. : 6 trophées cette saison");
    expect(t).not.toContain("en attente de publication");
    expect(t).toContain("Saison 2026/27 · après la journée 11");
    for (const shelf of ["Paliers", "Journées", "Décisions", "Ligue", "Carte"])
      expect(t).toContain(shelf);
    expect(t).toContain("Publié le 3 oct.");
    expect(t).toContain("Note 84 requise, la vôtre 72");
    expect(t).toContain("Un résultat corrigé ne retire jamais un trophée.");
    // league trophies are given at the end of the season: in progress, never earned
    expect(t).toContain("en cours");
    expect(t).toContain("3e pour l’instant. Attribué à la fin de la saison.");
    expect(t).toContain("Podium et champion de ligue : attribués à la fin de la saison");
    expect(html).not.toMatch(/<button[^>]*data-testid="trophy-league_(podium|leader)"/);
    // « Montrer mes trophées », on by default
    expect(t).toContain("Montrer mes trophées");
    expect(html).toMatch(
      /role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/,
    );
    expect(html).toContain('data-testid="trophies-share"');
    expect(html).toContain('data-testid="trophies-frames"');
    // the owner's rules: no « provisoire », no card serial
    expect(t).not.toMatch(/provisoire/i);
    expect(t).not.toContain("482913");
  });

  it("locked: the earned list clear, the cabinet blurred and inert, one unlock", async () => {
    const html = await render(
      <PlusTrophiesSection access="locked" identity={identity} />,
      seeded(false),
    );
    const t = text(html);
    expect(html).toContain('data-testid="plus-trophies-locked"');
    expect(html).toContain('data-testid="trophies-list"');
    expect(html).toContain('data-testid="trophies-visibility"');
    expect(t).toContain("Fondateur 2026");
    expect(t).toContain("Votre vitrine de trophées");
    expect(t).toContain("Découvrir");
    expect(html.match(/data-testid="plus-trophies-locked-unlock"/g)).toHaveLength(1);
    // under the blur: inert and hidden from readers, and not the reader's own figures
    expect(html).toMatch(/class="pl-under[^"]*"[^>]*aria-hidden="true"[^>]*inert/);
    expect(html).not.toContain('data-testid="trophy-detail"');
    // not a member: no frame to choose, no story format
    expect(html).not.toContain("trophies-frames");
  });
});

describe("« Montrer mes trophées »", () => {
  it("shows the switch off when the reader hid their trophies", async () => {
    const client = new QueryClient();
    client.setQueryData(trophyKeys.mine(null), mockTrophies("founder_2026", true, false));
    const html = await render(<PlusTrophiesSection access="member" identity={identity} />, client);
    expect(html).toMatch(/aria-checked="false"/);
    expect(html).toContain('data-testid="trophies-visibility-switch"');
  });
});

describe("the cabinet, drawn on its own", () => {
  it("lights earned plaques as buttons, dims the waiting one, flattens the rest", async () => {
    // the end of the season, the last journée not yet published: the podium waits
    const shelves = buildShelves(
      {
        ...mockTrophies("standard", true),
        pending: [{ code: "league_podium", gameweekSeq: 34, reason: "ratings_not_published" }],
      },
      "fr",
    );
    const html = await render(
      <TrophyCabinet shelves={shelves} newest="ten_gameweeks" onOpen={noop} />,
    );
    expect(html).toContain("tr-plaque--earned");
    expect(html).toContain("tr-plaque--pending");
    expect(html).toContain("tr-plaque--todo");
    expect(html.match(/<button[^>]*tr-plaque--earned/g)).toHaveLength(6);
    expect(html.match(/tr-plaque--new/g)).toHaveLength(1);
    expect(text(html)).toContain("Nouveau");
    // an unlit silhouette is not a button
    expect(html).not.toMatch(/<button[^>]*tr-plaque--todo/);
  });
});

describe("the detail and the frames", () => {
  const cabinet = mockTrophies("founder_2026", true);
  it("detail (member): the transfer, its stamp, the framed card, both formats, WhatsApp-ready share", async () => {
    const earned = cabinet.earned.find((e) => e.code === "winning_transfer")!;
    const html = await render(
      <TrophyDetail
        cabinet={cabinet}
        earned={earned}
        identity={identity}
        onBack={noop}
        onFrames={noop}
        titleRef={null}
      />,
    );
    const t = text(html);
    expect(t).toContain("Transfert gagnant : M. Tahiri → A. Chakir, +11 pts");
    expect(t).toContain("Publié le 3 oct.");
    expect(t).toContain("1 de vos 6 trophées cette saison");
    expect(t).toContain("Karim B. · KACM");
    expect(t).toContain("botolago.com · Fantasy Botola Pro");
    expect(t).toContain("Un résultat corrigé ne retire jamais ce trophée.");
    expect(t).toContain("Cadre Fondateur 2026");
    expect(t).toContain("Format story");
    expect(html).toContain('data-frame="founder_2026"');
    expect(t).not.toMatch(/provisoire|482913/i);
  });

  it("detail (not a member): the standard card, no story format, « Découvrir » for the frame", async () => {
    const free = mockTrophies("founder_2026", false);
    const earned = free.earned.find((e) => e.code === "gw_80")!;
    const html = await render(
      <TrophyDetail
        cabinet={free}
        earned={earned}
        identity={identity}
        onBack={noop}
        onFrames={noop}
        titleRef={null}
      />,
    );
    expect(html).toContain('data-frame="standard"');
    expect(text(html)).not.toContain("Format story");
    expect(html).toContain('data-testid="trophy-frame-unlock"');
    expect(html).toContain('data-testid="trophy-share"');
  });

  it("frames: standard first, the earned frames as a radio group, the rest to earn with their counts", async () => {
    const html = await render(
      <TrophyFrames cabinet={cabinet} identity={identity} onBack={noop} titleRef={null} />,
    );
    const t = text(html);
    expect(t).toContain("Choisissez le cadre de votre carte parmi vos 4 cadres gagnés");
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(5);
    expect(html).toContain('data-testid="frame-founder_2026"');
    expect(t).toContain("Choisi");
    expect(t).toContain("À gagner");
    expect(t).toContain("11 sur 30");
    expect(t).toContain("Note 84 requise, la vôtre 72");
    expect(t).toContain("aucun ne s’achète");
  });
});
