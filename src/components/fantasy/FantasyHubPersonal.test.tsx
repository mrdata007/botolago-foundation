import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { AuthProvider } from "@/auth/AuthProvider";
import type { FantasyScreenPhase } from "@/components/fpl/useFantasyScreen";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import type { AuthStatus } from "@/services/auth-types";
import type { FantasyDataSource } from "@/services/fantasy-data-source";
import type { FantasySummary, Gameweek } from "@/types/domain";
import type { FantasyTeam } from "@/types/fantasy";
import { GUEST_CREATE_NEXT } from "./FantasyGuestIntro";
import { FantasyHubLeagues, FantasyHubReminders, FantasyHubTeamArea } from "./FantasyHubPersonal";
import { fantasyHubLayout } from "./fantasy-hub-layout";

/**
 * Audit 2026-09-25 (A16) — what the Fantasy hub's personal parts render for
 * each visitor, from the session and screen state through the real
 * `fantasyHubLayout` to rendered markup: the team card's place, "Mes
 * ligues" with the cup, and the reminder switches, in the hub's order.
 *
 * Rendered with `react-dom/server` inside the app's providers (a memory
 * router for the links, React Query, the French dictionary, the auth
 * provider the switches read), as the club and match page tests do. The
 * auth provider renders its server state there, so the switches are drawn
 * disabled: what is checked is whether they are on the page at all. It sits
 * inside the router, where the app's root route puts it: its second-factor
 * gate reads the current location, and outside the router every render here
 * threw before a word of the hub was drawn.
 */

const fr = dictionaries.fr;
const ROOT = join(import.meta.dir, "..", "..", "..");
const code = (path: string) =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/fantasy"] }),
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

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const text = (html: string) => html.replace(/<[^>]+>/g, "");
const anchors = (html: string) => html.match(/<a [^>]*>/g) ?? [];
const hrefOf = (tag: string) => /href="([^"]*)"/.exec(tag)?.[1]?.replace(/&amp;/g, "&") ?? "";
const headings = (html: string) =>
  [...html.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => text(m[2]));

const GAMEWEEK: Gameweek = {
  number: 1,
  deadline: new Date(Date.now() + 3 * 24 * 3_600_000).toISOString(),
  isCurrent: true,
  averagePoints: null,
  highestPoints: null,
  enrolment: {
    id: "gw1",
    number: 1,
    deadline: new Date(Date.now() + 3 * 24 * 3_600_000).toISOString(),
  },
};

const TEAM: FantasyTeam = {
  managerName: "Amine",
  teamName: "Raja des Sables",
  formation: "4-4-2",
  squad: Array.from({ length: 15 }, (_, index) => ({ playerId: `p${index}`, slot: index + 1 })),
  bank: 1.5,
  freeTransfers: 1,
  pendingTransfers: 0,
};

const SUMMARY: FantasySummary = {
  managerName: "Amine",
  teamName: "Raja des Sables",
  totalPoints: 61,
  gameweekPoints: 61,
  overallRank: 1204,
  gameweekRank: null,
  transfersLeft: 1,
  bankValue: 1.5,
  teamValue: 100,
};

/** The hub's personal parts, in its order, for one state of the world. */
function hub({
  authStatus,
  source,
  phase,
  team,
}: {
  authStatus: AuthStatus;
  source: FantasyDataSource;
  phase: FantasyScreenPhase;
  team: FantasyTeam | null;
}) {
  const layout = fantasyHubLayout({ authStatus, source, phase, hasTeam: !!team });
  const owner = layout.audience === "owner";
  return render(
    <>
      <FantasyHubTeamArea
        layout={layout}
        phase={phase}
        retry={() => {}}
        gameweek={phase === "ready" ? GAMEWEEK : null}
        team={team}
        displayName={null}
        summary={owner ? SUMMARY : null}
        summaryPending={!owner}
        prizes={false}
      />
      <FantasyHubLeagues
        layout={layout}
        gameweek={1}
        overallRank={owner ? SUMMARY.overallRank : null}
        leagues={owner ? [{ id: "l1", name: "Les Aigles", rank: 2, members: 8 }] : []}
        leaguesLoading={false}
      />
      <FantasyHubReminders layout={layout} />
    </>,
  );
}

/** Everything that belongs to an owner, and nobody else. */
function expectNoDashboard(html: string) {
  const plain = text(html);
  expect(headings(html)).not.toContain(escapeHtml(fr["fantasy.hub.my_leagues"]));
  expect(plain).not.toContain(escapeHtml(fr["fpl.cup_not_qualified"]));
  expect(plain).not.toContain(escapeHtml(fr["fpl.no_leagues"]));
  expect(plain).not.toContain(escapeHtml(fr["fpl.notifications"]));
  expect(html).not.toContain('role="switch"');
  expect(anchors(html).map(hrefOf)).not.toContain("/fantasy/leagues/join");
  expect(anchors(html).map(hrefOf)).not.toContain("/fantasy/profile");
}

const placeholders = (html: string) =>
  [...html.matchAll(/data-testid="(fantasy-hub-[a-z]+-placeholder)"/g)].map((m) => m[1]);

describe("the hub's personal parts, for each visitor", () => {
  it("an owner gets the dashboard as before: team card, pick team, transfers, leagues, cup, switches", async () => {
    const html = await hub({
      authStatus: "authenticated",
      source: "cloud",
      phase: "ready",
      team: TEAM,
    });
    const links = anchors(html).map(hrefOf);
    expect(text(html)).toContain(TEAM.teamName);
    expect(links).toContain("/fantasy/profile");
    expect(links).toContain("/fantasy/team");
    expect(links).toContain("/fantasy/transfers");
    expect(text(html)).toContain(escapeHtml(fr["fpl.pick_team"]));
    expect(headings(html)).toEqual([
      escapeHtml(fr["fantasy.hub.my_leagues"]),
      escapeHtml(fr["fpl.general_leagues"]),
      escapeHtml(fr["fpl.private_leagues"]),
      escapeHtml(fr["fpl.cups"]),
      escapeHtml(fr["fpl.cup_how_title"]),
      escapeHtml(fr["fpl.notifications"]),
    ]);
    expect(links).toContain("/fantasy/leagues/l1");
    expect(text(html)).toContain(escapeHtml(fr["fpl.cup_not_qualified"]));
    expect(html.match(/role="switch"/g)).toHaveLength(2);
    // And nothing of the visitor's.
    expect(html).not.toContain('data-testid="fantasy-guest-intro"');
    expect(html).not.toContain('data-testid="fantasy-intro-create"');
    expect(placeholders(html)).toEqual([]);
  });

  it("signed in without a team: the proposition and its one button to the builder, nothing personal", async () => {
    const html = await hub({
      authStatus: "authenticated",
      source: "cloud",
      phase: "ready",
      team: null,
    });
    expect(html).toContain('data-testid="fantasy-guest-intro"');
    const create = anchors(html).find((tag) => tag.includes('data-testid="fantasy-intro-create"'));
    expect(hrefOf(create ?? "")).toBe("/fantasy/create");
    expect(headings(html)[0]).toBe(escapeHtml(fr["fantasy.intro.title"]));
    expectNoDashboard(html);
    expect(placeholders(html)).toEqual([]);
  });

  it.each([
    ["anonymous", "guest"],
    ["guest", "guest"],
  ] as const)(
    "signed out (%s): the proposition, sign-in first on the way to the builder, nothing personal",
    async (authStatus, source) => {
      const html = await hub({ authStatus, source, phase: "ready", team: null });
      expect(html).toContain('data-testid="fantasy-guest-intro"');
      const create = anchors(html).find((tag) =>
        tag.includes('data-testid="fantasy-intro-create"'),
      );
      const href = new URL(hrefOf(create ?? ""), "https://botolago.com");
      expect(href.pathname).toBe("/auth/login");
      expect(href.searchParams.get("next")).toBe(GUEST_CREATE_NEXT);
      expectNoDashboard(html);
      expect(placeholders(html)).toEqual([]);
    },
  );

  it("signed in while the screen loads — team or not — the place is held and nothing in it is said", async () => {
    // The first A16 fix showed "Mes ligues", the cup and the switches here,
    // to a visitor without a team as much as to an owner.
    for (const team of [null, TEAM]) {
      const html = await hub({
        authStatus: "authenticated",
        source: "cloud",
        phase: "loading",
        team,
      });
      expect(html).toContain(`aria-label="${escapeHtml(fr["state.loading"])}"`);
      expect(html).not.toContain('data-testid="fantasy-guest-intro"');
      expectNoDashboard(html);
      expect(headings(html)).toEqual([]);
      expect(placeholders(html)).toEqual([
        "fantasy-hub-leagues-placeholder",
        "fantasy-hub-reminders-placeholder",
      ]);
    }
  });

  it("while the session resolves (the server render): the same held place, for owner and visitor alike", async () => {
    for (const phase of ["loading", "ready"] as const) {
      for (const team of [null, TEAM]) {
        const html = await hub({ authStatus: "loading", source: "guest", phase, team });
        expect(html).not.toContain('data-testid="fantasy-guest-intro"');
        expectNoDashboard(html);
        expect(placeholders(html)).toEqual([
          "fantasy-hub-leagues-placeholder",
          "fantasy-hub-reminders-placeholder",
        ]);
      }
    }
  });

  it("signed out while the screen loads: held like the rest of the page, nothing said", async () => {
    // Let go when the proposition arrives, in the same frame, instead of a
    // first jump when the session resolves and a second when the screen does.
    const html = await hub({
      authStatus: "anonymous",
      source: "guest",
      phase: "loading",
      team: null,
    });
    expect(html).not.toContain('data-testid="fantasy-guest-intro"');
    expectNoDashboard(html);
    expect(headings(html)).toEqual([]);
    expect(placeholders(html)).toEqual([
      "fantasy-hub-leagues-placeholder",
      "fantasy-hub-reminders-placeholder",
    ]);
  });

  it.each([
    ["season_closed", "fantasy.availability.season_closed.title"],
    ["awaiting_gameweek", "fantasy.availability.awaiting_gameweek.title"],
    ["error", "fpl.error.title"],
  ] as const)(
    "signed in, %s: that panel alone — no leagues, no cup, no switches, no create button",
    async (phase, title) => {
      for (const team of [null, TEAM]) {
        const html = await hub({ authStatus: "authenticated", source: "cloud", phase, team });
        expect(text(html)).toContain(escapeHtml(fr[title]));
        expect(html).not.toContain('data-testid="fantasy-guest-intro"');
        expect(html).not.toContain('data-testid="fantasy-intro-create"');
        expectNoDashboard(html);
        expect(placeholders(html)).toEqual([]);
      }
    },
  );
});

describe("the hub's personal parts — design-system rules in source", () => {
  // They left the route, where no source check read them; the proposition's
  // rules apply to them as well.
  const source = code("src/components/fantasy/FantasyHubPersonal.tsx");

  it("uses logical properties only, so it mirrors in Arabic", () => {
    expect(source).not.toMatch(
      /["'`\s](?:m[lr]|p[lr]|border-[lr]|rounded-[lr]|rounded-(?:tl|tr|bl|br)|text-(?:left|right)|float-(?:left|right))(?:-|\b)/,
    );
    expect(source).not.toMatch(/["'`\s]-?(?:left|right)-(?:\d|\[|1\/2|full|px)/);
    expect(source).not.toMatch(/(?<!ltr:)tracking-/);
  });

  it("takes every colour from the kit's tokens", () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\(/);
    expect(source).not.toMatch(/\b(?:bg|text)-(?:white|black)\b/);
    expect(source).not.toMatch(/(?:text|ring|border)-\[color:var\(--ui-ink\)\]/);
  });
});

describe("the hub places them", () => {
  const hub = code("src/routes/fantasy.index.tsx");

  it("decides them with fantasyHubLayout, from the session and the screen", () => {
    expect(hub).toContain(
      "const layout = fantasyHubLayout({ authStatus, source, phase: screen.phase, hasTeam: !!team });",
    );
  });

  it("once each, in its order: team area, shortcuts, leagues, News, reminders, more about", () => {
    const order = [
      "<FantasyHubTeamArea",
      "<ShortcutTiles />",
      "<FantasyHubLeagues",
      "{NEWS_ENABLED && (",
      "<FantasyHubReminders layout={layout} />",
      "<MoreAboutSection />",
    ];
    for (const needle of order) expect(hub.split(needle)).toHaveLength(2);
    const at = order.map((needle) => hub.indexOf(needle));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    // The owner's pieces live with the other personal parts, not beside them.
    for (const piece of ["<TeamCard", "<LeaguesSection", "<NotificationsSection"]) {
      expect(hub).not.toContain(piece);
    }
  });

  it("passes every personal part the same layout", () => {
    expect(hub.match(/layout=\{layout\}/g)).toHaveLength(3);
  });
});
