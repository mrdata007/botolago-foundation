import { beforeEach, describe, expect, it } from "bun:test";
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

import { AuthPromptActions } from "@/components/auth/AuthPromptDialog";
import { FantasyResumeDraft } from "@/components/fantasy/FantasyGuestIntro";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { fantasyPlayers } from "@/mocks/fantasy-data";
import {
  accountDraftKey,
  createDraftProgress,
  GUEST_DRAFT_KEY,
} from "@/services/fantasy-create-draft";
import { initCreateDraft, placePlayer } from "@/services/fantasy-create-service";
import { fantasyDraftsStore } from "@/services/fantasy-drafts-store";
import type { Position } from "@/types/fantasy";
import { CaptainChoice } from "./CaptainChoice";
import { CaptainActions } from "./PlayerActionSheet";
import { SquadBuilderScreen, type BuilderSlot } from "./SquadBuilderScreen";

/**
 * The first squad, critique 2026-10-06 issue 2: the captain is asked for
 * rather than given, a substitute's sheet says why he cannot wear the
 * armband, the bench is on the bench strip, the sign-up box leads with a free
 * account, and the hub offers the draft back. Rendered with
 * `react-dom/server` inside the app's providers (French), as the hub tests
 * do; sheets and modals render into a portal the server does not draw, so
 * their contents are rendered on their own.
 */

const fr = dictionaries.fr;

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/fantasy/create"] }),
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
const buttons = (html: string) =>
  [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    attrs: m[1],
    label: text(m[2]).trim(),
  }));

const byPosition = (position: Position) => fantasyPlayers.filter((p) => p.position === position);

describe("captain actions on a player's sheet", () => {
  it("a starter gets both actions", async () => {
    const html = await render(<CaptainActions isStarter onCaptain={() => {}} onVice={() => {}} />);
    expect(buttons(html).map((b) => b.label)).toEqual([
      fr["fpl.make_captain"],
      fr["fpl.make_vice"],
    ]);
    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain(fr["fantasy.create.starters_only"]);
  });

  it("a substitute gets both, unavailable, with the reason instead of nothing", async () => {
    const html = await render(
      <CaptainActions isStarter={false} onCaptain={() => {}} onVice={() => {}} />,
    );
    const rows = buttons(html);
    expect(rows.map((b) => b.label)).toEqual([
      `${fr["fpl.make_captain"]} ${fr["fantasy.create.starters_only"]}`,
      `${fr["fpl.make_vice"]} ${fr["fantasy.create.starters_only"]}`,
    ]);
    for (const row of rows) expect(row.attrs).toContain('aria-disabled="true"');
  });

  it("a screen without captain actions (transfers) shows none", async () => {
    const html = await render(<CaptainActions isStarter={false} />);
    expect(buttons(html)).toEqual([]);
  });
});

describe("the captain section of the last step", () => {
  const starters = [
    byPosition("GK")[0],
    ...byPosition("DEF").slice(0, 4),
    ...byPosition("MID").slice(0, 4),
    ...byPosition("FWD").slice(0, 2),
  ];

  it("asks for both armbands, says why the captain matters, and offers starters only", async () => {
    const html = await render(
      <CaptainChoice
        starters={starters}
        clubs={[]}
        captainId={null}
        viceId={null}
        onChoose={() => {}}
      />,
    );
    expect(text(html)).toContain(fr["fantasy.create.captain_title"]);
    const rows = buttons(html);
    expect(rows.map((b) => /aria-label="([^"]*)"/.exec(b.attrs)?.[1])).toEqual([
      `${fr["fpl.captain"]} : ${fr["fantasy.create.captain_pick"]}`,
      `${fr["fpl.vice_captain"]} : ${fr["fantasy.create.captain_pick"]}`,
    ]);
    for (const row of rows) expect(row.attrs).toContain('aria-haspopup="dialog"');
  });

  it("names the chosen captain and vice-captain", async () => {
    const html = await render(
      <CaptainChoice
        starters={starters}
        clubs={[]}
        captainId={starters[3].id}
        viceId={starters[6].id}
        onChoose={() => {}}
      />,
    );
    const labels = buttons(html).map((b) =>
      decode(/aria-label="([^"]*)"/.exec(b.attrs)?.[1] ?? ""),
    );
    expect(labels).toEqual([
      `${fr["fpl.captain"]} : ${starters[3].name.fr}`,
      `${fr["fpl.vice_captain"]} : ${starters[6].name.fr}`,
    ]);
  });
});

describe("the builder's bench", () => {
  // 4-4-2: slots 1–11 start, 12–15 (GK, DEF, MID, FWD) are the bench.
  const layout: Position[] = [
    "GK",
    "DEF",
    "DEF",
    "DEF",
    "DEF",
    "MID",
    "MID",
    "MID",
    "MID",
    "FWD",
    "FWD",
    "GK",
    "DEF",
    "MID",
    "FWD",
  ];
  const slots: BuilderSlot[] = layout.map((position, index) => ({
    slot: index + 1,
    position,
    player: null,
  }));
  const screen = (showBench: boolean) => (
    <SquadBuilderScreen
      title="Sélection"
      gameweek={3}
      deadlineIso="2026-10-08T14:30:00Z"
      stats={[]}
      slots={slots}
      clubs={[]}
      players={[]}
      view="squad"
      onViewChange={() => {}}
      onSlotTap={() => {}}
      onAddPlayer={() => {}}
      onNext={() => {}}
      listColumns={[]}
      showBench={showBench}
    />
  );
  const emptySlotLabels = (html: string) =>
    [...html.matchAll(/aria-label="Ajouter un joueur — ([^"]*)"/g)].map((m) => m[1]);

  it("first selection: eleven on the pitch, four on the labelled bench strip", async () => {
    const html = await render(screen(true));
    // Every slot is still there, in pitch order then bench order.
    expect(emptySlotLabels(html)).toEqual(
      layout.map((position) => fr[`player.pos.${position}` as keyof typeof fr]),
    );
    const t = text(html);
    expect(t).toContain(`${fr["fpl.gkp"]} 1. ${fr["player.pos.DEF"]} 2. ${fr["player.pos.MID"]}`);
    expect(t).toContain(`3. ${fr["player.pos.FWD"]}`);
  });

  it("transfers keep all fifteen on the pitch, with no bench strip", async () => {
    const html = await render(screen(false));
    expect(emptySlotLabels(html)).toHaveLength(15);
    expect(text(html)).not.toContain(`1. ${fr["player.pos.DEF"]}`);
  });
});

describe("the sign-up box", () => {
  it("leads with signing in everywhere by default", async () => {
    const html = await render(
      <AuthPromptActions
        primary="login"
        onLogin={() => {}}
        onRegister={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(buttons(html).map((b) => b.label)).toEqual([
      fr["auth.prompt.login"],
      fr["auth.prompt.register"],
      fr["auth.prompt.cancel"],
    ]);
  });

  it("after building a squad: a free account first, signing in second, exploring last", async () => {
    const html = await render(
      <AuthPromptActions
        primary="register"
        onLogin={() => {}}
        onRegister={() => {}}
        onCancel={() => {}}
      />,
    );
    const rows = buttons(html);
    expect(rows.map((b) => b.label)).toEqual([
      "Créer un compte gratuit",
      fr["auth.prompt.login"],
      fr["auth.prompt.cancel"],
    ]);
    // The first is the gradient (primary) button, the second the outline one.
    expect(rows[0].attrs).toContain("--ui-grad-action");
    expect(rows[1].attrs).not.toContain("--ui-grad-action");
  });
});

describe("the hub offers the draft back", () => {
  beforeEach(() => fantasyDraftsStore.__resetAll());

  const draftWith = (count: number) => {
    let draft = initCreateDraft("Atlas FC");
    const pool = [...fantasyPlayers];
    for (const slot of draft.slots.slice(0, count)) {
      const player = pool.find((p) => p.position === slot.position)!;
      pool.splice(pool.indexOf(player), 1);
      draft = placePlayer(draft, slot.slot, player.id);
    }
    return draft;
  };

  it("counts the squad the builder will open", () => {
    expect(createDraftProgress(null)).toBeNull();
    fantasyDraftsStore.save(GUEST_DRAFT_KEY, draftWith(0));
    expect(createDraftProgress(null)).toBeNull();
    fantasyDraftsStore.save(GUEST_DRAFT_KEY, draftWith(12));
    expect(createDraftProgress(null)).toEqual({ filled: 12, total: 15 });
    // Signed in without a draft of their own: the visitor's, as the builder adopts it.
    expect(createDraftProgress("user-1")).toEqual({ filled: 12, total: 15 });
    fantasyDraftsStore.save(accountDraftKey("user-1"), draftWith(5));
    expect(createDraftProgress("user-1")).toEqual({ filled: 5, total: 15 });
  });

  it("ignores a malformed draft", () => {
    fantasyDraftsStore.save(GUEST_DRAFT_KEY, { teamName: "x", slots: [] });
    expect(createDraftProgress(null)).toBeNull();
  });

  it('"Reprendre mon équipe (12/15)" leads back to the builder', async () => {
    const html = await render(<FantasyResumeDraft filled={12} total={15} audience="signed_out" />);
    expect(text(html)).toContain("Reprendre mon équipe (12/15)");
    expect(html).toMatch(/<a [^>]*href="\/fantasy\/create"/);
    expect(html).toContain('aria-valuenow="12"');
    expect(html).toContain('aria-valuemax="15"');
    // The visitor is told where the draft lives and when an account is asked for.
    expect(decode(html)).toContain(fr["fantasy.create.guest_note"]);
  });

  it("does not tell a signed-in manager an account will be asked for", async () => {
    const html = await render(<FantasyResumeDraft filled={15} total={15} audience="no_team" />);
    expect(decode(html)).not.toContain(fr["fantasy.create.guest_note"]);
  });
});
