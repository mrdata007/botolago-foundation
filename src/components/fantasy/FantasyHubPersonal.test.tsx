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
  pointsGameweek: 1,
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
    // Before the deadline the next action is preparing the team.
    expect(text(html)).toContain(escapeHtml(fr["fantasy.next.prepare"]));
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
    "signed out (%s): the proposition, straight to the builder, nothing personal",
    async (authStatus, source) => {
      const html = await hub({ authStatus, source, phase: "ready", team: null });
      expect(html).toContain('data-testid="fantasy-guest-intro"');
      const create = anchors(html).find((tag) =>
        tag.includes('data-testid="fantasy-intro-create"'),
      );
      const href = new URL(hrefOf(create ?? ""), "https://botolago.com");
      expect(href.pathname).toBe(GUEST_CREATE_NEXT);
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

/**
 * BG-0155 (2) — the team card's score names its round and leads to Points.
 * The card was one link to the team profile, its figure was the summary's
 * `gameweekPoints` under the generic "Points de la journée" (last round's 58
 * under this round's deadline), with 0 for "no result", and with the deadline
 * ahead the hub had no way to Points. Now the team block and the points block
 * are two links, and the label names the round the figure belongs to.
 */
describe("the team card: its score names its round and leads to Points", () => {
  const ROUND_14: Gameweek = { ...GAMEWEEK, number: 14, status: "open" };
  /** The sample's state: round 14 is current, the 58 points are round 13's. */
  const SAMPLE: FantasySummary = { ...SUMMARY, gameweekPoints: 58, pointsGameweek: 13 };

  function card(
    summary: FantasySummary | null,
    gameweek: Gameweek = ROUND_14,
    summaryFailed = false,
  ) {
    const layout = fantasyHubLayout({
      authStatus: "authenticated",
      source: "cloud",
      phase: "ready",
      hasTeam: true,
    });
    return render(
      <FantasyHubTeamArea
        layout={layout}
        phase="ready"
        retry={() => {}}
        gameweek={gameweek}
        team={TEAM}
        displayName={null}
        summary={summary}
        summaryPending={false}
        summaryFailed={summaryFailed}
        prizes={false}
      />,
    );
  }

  /** The whole `<a …>…</a>` element carrying `testId`. */
  const link = (html: string, testId: string) =>
    new RegExp(`<a [^>]*data-testid="${testId}"[^>]*>[\\s\\S]*?</a>`).exec(html)?.[0] ?? "";
  const attr = (element: string, name: string) =>
    new RegExp(`^<a [^>]*\\b${name}="([^"]*)"`).exec(element)?.[1]?.replace(/&amp;/g, "&");

  it("labels the figure with its round and links the points block to that round", async () => {
    const html = await card(SAMPLE);
    const points = link(html, "fantasy-team-card-points");
    expect(attr(points, "href")).toBe("/fantasy/points?gw=13");
    expect(text(points)).toContain("58");
    expect(text(points)).toContain("Points · J13");
    expect(fr["fantasy.hub.points_round"].replace("{n}", "13")).toBe("Points · J13");
    // The generic label that never said which round is gone from the card.
    expect(text(html)).not.toContain(escapeHtml(fr["fantasy.gw_points"]));
    // Its name is its visible text first (what a speech-control user says,
    // WCAG 2.5.3), then where it leads, read by screen readers only.
    expect(attr(points, "aria-label")).toBeUndefined();
    expect(text(points).startsWith("58")).toBe(true);
    expect(text(points)).toContain("Voir mes points de la journée 13");
    expect(points).toMatch(/<span class="sr-only">Voir mes points de la journée 13<\/span>/);
  });

  it("keeps the team block a link to the team profile, named by its own text", async () => {
    const html = await card(SAMPLE);
    const team = link(html, "fantasy-team-card-team");
    expect(attr(team, "href")).toBe("/fantasy/profile");
    expect(attr(team, "aria-label")).toBeUndefined();
    expect(text(team)).toContain(TEAM.teamName);
    expect(text(team)).toContain(`${fr["fpl.rank"]} 1`);
    // Two links, each in the gradient card; the card itself is not one.
    const cardTag = /<[a-z]+ [^>]*data-testid="fantasy-team-card"[^>]*>/.exec(html)?.[0] ?? "";
    expect(cardTag.startsWith("<div ")).toBe(true);
    const links = anchors(html).map(hrefOf);
    expect(links.filter((href) => href === "/fantasy/profile")).toHaveLength(1);
    expect(links.filter((href) => href.startsWith("/fantasy/points"))).toHaveLength(1);
  });

  it("draws a focus ring and a 44px floor on both links", async () => {
    const html = await card(SAMPLE);
    for (const id of ["fantasy-team-card-team", "fantasy-team-card-points"]) {
      const tag = /^<a [^>]*>/.exec(link(html, id))?.[0] ?? "";
      expect(tag).toContain("focus-visible:ring-2");
      expect(tag).toContain("min-h-[var(--ui-tap-min)]");
    }
  });

  it("keeps Moyenne / Meilleur / Total a plain row, outside both links", async () => {
    const html = await card(SAMPLE);
    const strip = html.indexOf("<dl");
    expect(strip).toBeGreaterThan(-1);
    const before = html.slice(0, strip);
    expect((before.match(/<a /g) ?? []).length).toBe((before.match(/<\/a>/g) ?? []).length);
    const dl = html.slice(strip, html.indexOf("</dl>", strip));
    expect(dl).not.toContain("<a ");
    expect(dl).not.toContain("<button");
    for (const key of ["fpl.average", "fpl.highest", "fpl.total"] as const) {
      expect(text(dl)).toContain(fr[key]);
    }
  });

  it("with no result yet: an en dash, never 0, and no round to name or link", async () => {
    // What production sends with an empty history: 0 for the round, and a
    // season total that is the sum of nothing.
    const html = await card({
      ...SUMMARY,
      gameweekPoints: 0,
      totalPoints: 0,
      pointsGameweek: null,
    });
    const points = link(html, "fantasy-team-card-points");
    expect(attr(points, "href")).toBe("/fantasy/points");
    expect(text(points)).toContain("Voir mes points");
    expect(text(points)).toContain(fr["fantasy.stat.none"]);
    expect(text(points)).toContain(escapeHtml("Aucun point pour l'instant"));
    expect(text(points)).not.toContain("J1");
    // Nowhere on the card, the Total included.
    const whole = /<div [^>]*data-testid="fantasy-team-card"[\s\S]*?<\/dl>/.exec(html)?.[0] ?? "";
    expect(whole).not.toBe("");
    expect(text(whole)).not.toMatch(/(^|\D)0(\D|$)/);
  });

  it("a failed summary says nothing it does not know: a dash and the neutral label", async () => {
    const html = await card(null, ROUND_14, true);
    const points = link(html, "fantasy-team-card-points");
    expect(text(points)).toContain(fr["fantasy.stat.none"]);
    expect(text(points)).toContain(escapeHtml(fr["fantasy.gw_points"]));
    expect(text(points)).not.toContain(escapeHtml("Aucun point pour l'instant"));
  });

  it("an unknown summary reads the same as no result: a dash, never 0", async () => {
    const html = await card(null);
    const points = link(html, "fantasy-team-card-points");
    expect(attr(points, "href")).toBe("/fantasy/points");
    expect(text(points)).toContain(fr["fantasy.stat.none"]);
    expect(text(points)).not.toMatch(/\b0\b/);
  });

  it("while the round is live, the live pill stands in for the label only when the figure is that round's", async () => {
    const live: Gameweek = { ...ROUND_14, status: "live" };
    const pill = `${fr["fantasy.leagues.gw"]}14 · ${fr["matches.status.live"]}`;

    const own = link(
      await card({ ...SAMPLE, pointsGameweek: 14 }, live),
      "fantasy-team-card-points",
    );
    expect(text(own)).toContain(pill);
    expect(text(own)).not.toContain("Points · J14");
    expect(attr(own, "href")).toBe("/fantasy/points?gw=14");

    // Round 14 is live but the figure is still round 13's: it says so.
    const last = link(await card(SAMPLE, live), "fantasy-team-card-points");
    expect(text(last)).not.toContain(pill);
    expect(text(last)).toContain("Points · J13");
    expect(attr(last, "href")).toBe("/fantasy/points?gw=13");
  });

  it("says the same in Arabic, in the brief's words", () => {
    const ar = dictionaries.ar;
    expect(ar["fantasy.hub.points_round"].replace("{n}", "13")).toBe("نقاط الجولة 13");
    expect(ar["fantasy.hub.points_none"]).toBe("لا نقاط بعد");
    expect(ar["fantasy.hub.points_open"].replace("{n}", "13")).toBe("عرض نقاطي في الجولة 13");
    expect(ar["fantasy.hub.points_open_any"]).toBe("عرض نقاطي");
    expect(fr["fantasy.hub.points_none"]).toBe("Aucun point pour l'instant");
    expect(fr["fantasy.hub.points_open_any"]).toBe("Voir mes points");
  });
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
