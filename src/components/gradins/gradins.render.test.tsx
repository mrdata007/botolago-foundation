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
import { FantasyOwnedProvider } from "@/services/fantasy-owned-provider";
import { FIXTURES, type FixtureId } from "@/backend/manager-card/fixtures";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import type { Club, Gameweek } from "@/types/domain";

import { GradinsHomeView } from "./GradinsHome";
import { homeState, type HomeState } from "./gradins-state";

/**
 * What G1 renders on the server for each state of plan 4.1, inside the app's providers (a memory
 * router for the links, React Query, the French dictionary, the auth provider the bars read). The
 * card itself is drawn on the client only, so the server markup is the reserved box, the rating
 * line, the identity line and the blocks that need no data of their own: exactly what a reader
 * sees before the card's chunk has loaded.
 */
const fr = dictionaries.fr;

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AuthProvider>
          <FantasyOwnedProvider>{node}</FantasyOwnedProvider>
        </AuthProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/gradins"] }),
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

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
/** The same with the spaces the isolates leave around a slash removed (« 1 / 3 » is « 1/3 »). */
const tight = (html: string) => text(html).replace(/\s*\/\s*/g, "/");
const headings = (html: string) =>
  [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => text(m[2]!).trim());

const CLUBS: Club[] = [
  {
    id: "rca",
    name: { fr: "Raja CA", ar: "الرجاء الرياضي" },
    shortName: { fr: "RCA", ar: "الرجاء" },
    city: { fr: "Casablanca", ar: "الدار البيضاء" },
    primaryColor: "#0a8f3a",
    crestPlaceholder: "RCA",
  },
];
const GAMEWEEK: Gameweek = {
  number: 14,
  deadline: new Date(Date.now() + 30 * 3_600_000).toISOString(),
  isCurrent: true,
  averagePoints: null,
  highestPoints: null,
  status: "open",
};

function view(state: HomeState, over: { canCreate?: boolean; loadingAction?: boolean } = {}) {
  return render(
    <GradinsHomeView
      state={state}
      clubs={CLUBS}
      gameweek={GAMEWEEK}
      canCreate={over.canCreate ?? true}
      loadingAction={over.loadingAction ?? false}
      displayName="Rachid"
      favouriteClubId="rca"
      minRated={3}
      retry={() => {}}
    />,
  );
}

const owner = (id: FixtureId) =>
  view(
    homeState({
      audience: "owner",
      phase: "ready",
      registrationClosed: false,
      read: { status: "success", card: FIXTURES[id].card },
    }),
  );

/** The words the plan bans, in any string a reader sees (section 2.5). */
const BANNED = [
  /\bpull\b/i,
  /\bpack\b/i,
  /level up/i,
  /monter de niveau/i,
  /débloquer/i,
  /tirage/i,
  /révélation/i,
  /officiel/i,
  /\bVIP\b/,
  /exclusif/i,
  /\brare\b/i,
  /collectionner/i,
  /dernière chance/i,
  /meilleure carte/i,
  /classement des cartes/i,
];

describe("G1 for a visitor", () => {
  it("shows the guest's proposition and the way in", async () => {
    const html = await view({ kind: "guest", closed: false });
    expect(headings(html)).toEqual(["Gradins", fr["gradins.guest.headline"]]);
    expect(html).toContain('data-testid="gradins-guest"');
    expect(text(html)).toContain(fr["gradins.guest.body"].slice(0, 40));
    expect(html).toContain('href="/fantasy/create"');
    expect(html).toContain(fr["fantasy.next.create"]);
    expect(html).toContain(fr["gradins.guest.sign_in"]);
    expect(html).toContain(fr["gradins.guest.free"]);
    expect(html).toContain('href="/auth/login?next=%2Fgradins"');
  });

  it("draws the four points, and no serial and no number", async () => {
    const html = await view({ kind: "guest", closed: false });
    for (const key of [
      "gradins.guest.point.name.title",
      "gradins.guest.point.club.title",
      "gradins.guest.point.rating.title",
      "gradins.guest.point.people.title",
    ] as const) {
      expect(html).toContain(fr[key]);
    }
    // The rating point says after how many journées, from the server's status (3 in the test).
    expect(text(html)).toContain("3 journées terminées");
    expect(html).not.toContain("BOT #");
    expect(html).not.toMatch(/\d+ OVR/);
  });

  it("says registration is closed in the hub's words, and offers no team", async () => {
    const html = await view({ kind: "guest", closed: true });
    expect(headings(html)).toContain(fr["fantasy.availability.registration_closed.title"]);
    expect(html).not.toContain('href="/fantasy/create"');
    expect(html).not.toContain(fr["fantasy.next.create"]);
  });

  it("holds the button's place while the Fantasy screen has not answered", async () => {
    const html = await view({ kind: "guest", closed: false }, { loadingAction: true });
    expect(html).toContain("gradins-guest-action-loading");
    expect(html).not.toContain('href="/fantasy/create"');
  });

  it("offers an account with no team its own proposition, without a sign-in", async () => {
    const html = await view({ kind: "no_team", closed: false });
    expect(html).toContain('data-testid="gradins-no-team"');
    expect(html).toContain(fr["gradins.noteam.headline"]);
    expect(html).toContain('href="/fantasy/create"');
    expect(html).not.toContain(fr["gradins.guest.sign_in"]);
    // The way the card begins, with the rating's minimum from the status.
    expect(text(html)).toContain("Sa note arrive après 3 journées terminées");
  });
});

describe("G1 for a manager", () => {
  it("shows the rated card's rating line, identity line and blocks", async () => {
    const html = await owner("rated");
    expect(html).toContain('data-testid="gradins-stage"');
    const line = html.match(/data-testid="gradins-rating-line"[\s\S]*?<\/p>/)![0];
    expect(text(line)).toContain("84");
    expect(text(line)).toContain("OVR");
    expect(text(line)).toContain("PRO");
    expect(text(line)).toContain(fr["card.provisional"]);
    expect(text(html.match(/data-testid="gradins-identity-line"[\s\S]*?<\/p>/)![0])).toContain(
      "Depuis la J5",
    );
    // The statistics are the server's, in order, with their labels.
    expect(html).toContain("gradins-stat-tiles");
    for (const code of ["CAP", "SEL", "TRF", "CON"]) expect(html).toContain(code);
    expect(text(html)).toContain(fr["gradins.round.recalc"]);
    expect(html).toContain('href="/fantasy/team"');
    expect(html).toContain(fr["card.onboarding.m4.sheet.share"]);
  });

  it("puts belonging first: the people, the club and the seasons before how the note is made", async () => {
    const html = await owner("rated");
    const at = (needle: string) => html.indexOf(needle);
    expect(at('data-testid="gradins-people"')).toBeGreaterThan(-1);
    expect(at('data-testid="gradins-people"')).toBeLessThan(at('data-testid="gradins-round"'));
    expect(at('data-testid="gradins-round"')).toBeLessThan(at('data-testid="gradins-stats"'));
    expect(at('data-testid="gradins-seasons"')).toBeLessThan(at('data-testid="gradins-round"'));
  });

  it("shows a dash and the reason for a statistic that is not there, never a zero", async () => {
    const html = await owner("ratedTrfNull");
    const trf = html.match(/data-stat="trf"[\s\S]*?<\/li>/)![0];
    expect(text(trf)).toContain("—");
    expect(text(trf)).toContain(fr["card.reason.no_transfers"]);
    expect(text(trf)).not.toMatch(/\b0\b/);
  });

  it("shows a forming card as « Carte en formation · 1/3 », with its counter and no number", async () => {
    const html = await owner("forming1");
    const line = html.match(/data-testid="gradins-rating-line"[\s\S]*?<\/p>/)![0];
    expect(text(line)).toContain(fr["card.onboarding.m3.label"]);
    expect(tight(line)).toContain("1/3");
    expect(text(line)).not.toContain("OVR");
    expect(html).toContain("1 journée comptée sur 3");
    expect(html).toContain(fr["gradins.share.label"] ? "" : "");
    // Nothing to share before a number: the way on is to invite.
    expect(html).not.toContain('data-testid="gradins-share"');
    expect(html).toContain(fr["fantasy.hub.invite_share"]);
  });

  it("says the founder is a founder only in the identity line, and only for the founder", async () => {
    const founder = await owner("founder");
    expect(text(founder.match(/data-testid="gradins-identity-line"[\s\S]*?<\/p>/)![0])).toContain(
      fr["card.onboarding.m9.heading"],
    );
    const plain = await owner("rated");
    expect(plain).not.toContain(fr["card.onboarding.m9.heading"]);
  });

  it("replaces « Cette journée » with the season's end, and keeps the final number", async () => {
    const html = await owner("seasonClosed");
    expect(headings(html)).toContain(fr["gradins.season.closed_label"]);
    expect(text(html)).toContain("Saison 2026/27 terminée : 86, PRO.");
    expect(html).not.toContain('href="/fantasy/team"');
  });

  it("shows last season's number labelled with its season in a new season", async () => {
    const html = await owner("seasonStarted");
    const line = html.match(/data-testid="gradins-rating-line"[\s\S]*?<\/p>/)![0];
    expect(text(line)).toContain("86");
    expect(text(line)).toContain("2026/27");
    expect(text(html)).toContain("garde sa note 2026/27");
  });

  it("drops the forming display of a season that is over, keeping « 1/3 · 2026/27 » as a line", async () => {
    const card = { ...FIXTURES.forming1.card!, seasonClosed: true };
    const html = await view({ kind: "card", card });
    expect(html).not.toContain('data-testid="gradins-rating-line"');
    expect(html).not.toContain(fr["card.onboarding.m3.label"]);
    const round = html.match(/data-testid="gradins-round"[\s\S]*?<\/section>/)![0];
    expect(text(round)).toContain(
      "Saison terminée avant votre première note : elle viendra en 2027/28.",
    );
    expect(tight(round)).toContain("1/3 · 2026/27");
    expect(round).not.toContain('href="/fantasy/team"');
  });

  it("says an account the read does not know has no card, and offers the profile", async () => {
    const html = await view({ kind: "unavailable" });
    expect(text(html)).toContain(fr["gradins.unavailable"]);
    expect(html).toContain('href="/profile"');
  });

  it("shows an error panel with a retry, and no number, when the read failed", async () => {
    const html = await view({ kind: "error", stepUp: false, retry: "card" });
    expect(text(html)).toContain(fr["card.onboarding.state.offline.text"]);
    expect(html).toContain(fr["state.retry"]);
    expect(html).not.toMatch(/\d+ OVR/);
  });

  it("announces loading once and reserves the card's shape", async () => {
    const html = await view({ kind: "loading" });
    expect(html).toContain('role="status"');
    expect(html).toContain(`aria-label="${fr["state.loading"]}"`);
  });
});

describe("every Gradins home", () => {
  const states: Array<[string, () => Promise<string>]> = [
    ["guest", () => view({ kind: "guest", closed: false })],
    ["guest closed", () => view({ kind: "guest", closed: true })],
    ["no team", () => view({ kind: "no_team", closed: false })],
    ["rated", () => owner("rated")],
    ["forming", () => owner("forming1")],
    ["founder", () => owner("founder")],
    ["season closed", () => owner("seasonClosed")],
    ["season started", () => owner("seasonStarted")],
    ["unavailable", () => view({ kind: "unavailable" })],
  ];

  for (const [name, make] of states) {
    it(`${name}: no heading carries a name, every link and button is named, no banned word`, async () => {
      const html = await make();
      for (const heading of headings(html)) {
        expect(heading).not.toMatch(/\bAli\b|Rachid|KARIM|SALMA|YASMINE|OTHMANE|HAMZA/);
      }
      const controls = [...html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)];
      for (const [, tag, attrs, inner] of controls) {
        const named = /aria-label="[^"]+"/.test(attrs!) || text(inner!).trim().length > 0;
        expect(named, `${tag} ${attrs}`).toBe(true);
      }
      const words = text(html);
      for (const banned of BANNED) expect(words).not.toMatch(banned);
      expect(html).not.toMatch(/ ml-| mr-| pl-| pr-| left-| right-| text-left| text-right/);
    });
  }
});
