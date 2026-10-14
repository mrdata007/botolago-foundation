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
import { mockCareer, mockDuel } from "@/backend/premium/card-reads-mock";
import type { CareerMember, DuelMember } from "@/backend/premium/card-reads";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { premiumCardReadsService } from "@/services/premium-card-reads";
import { premiumCardKeys } from "@/services/use-premium-card-reads";

import { PlusDuelSection } from "./PlusDuelSection";
import { PlusHomeDuel, PlusHomeSeason } from "./PlusHomeBlocks";
import { PlusHeaderLogo, PlusMemberMark } from "./PlusMemberMark";
import { PlusSeasonSection } from "./PlusSeasonSection";
import { plusAccess } from "./plus-access";
import { careerToSeasonView, duelToSeasonView } from "./plus-member-data";

const { fr, ar } = dictionaries;

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

/** A member whose figures appear nowhere in the example season. */
function distinctCareer(): CareerMember {
  const c = mockCareer();
  return {
    ...c,
    weeks: c.weeks.map((w, i) => ({ ...w, score: 301 + i * 7 })),
  };
}
const standing = { totalScore: 612, rank: 3, size: 5 };

describe("who sees what", () => {
  it("is off unless the build, the answer and the feature agree", () => {
    const on = { surfaces: true, ready: true, enabled: true, isMember: false };
    expect(plusAccess(on)).toBe("locked");
    expect(plusAccess({ ...on, isMember: true })).toBe("member");
    expect(plusAccess({ ...on, surfaces: false, isMember: true })).toBe("off");
    expect(plusAccess({ ...on, ready: false })).toBe("off");
    expect(plusAccess({ ...on, enabled: false, isMember: true })).toBe("off");
  });
});

describe("« Votre saison » on the card page", () => {
  it("non-member: real points and position clear, the example blurred and inert, one unlock", async () => {
    let calls = 0;
    const original = premiumCardReadsService.career;
    premiumCardReadsService.career = (async () => {
      calls++;
      return mockCareer();
    }) as typeof original;
    try {
      const html = await render(<PlusSeasonSection access="locked" standing={standing} />);
      const visible = text(html);
      expect(html).toContain('data-testid="plus-season-locked"');
      expect(html).toContain('data-testid="plus-real-points"');
      expect(visible).toContain("612");
      expect(visible).toContain("3e sur 5");
      expect(visible).toContain(fr["plus.in.season_title"]);
      expect(visible).toContain(fr["plus.in.unlock"]);
      expect(html).toContain('href="/curva/plus?step=3&amp;via=season"');
      expect(html).toMatch(/class="pl-under[^"]*" aria-hidden="true" inert=""/);
      // The head is outside the blur.
      expect(html.indexOf("plus-real-points")).toBeLessThan(html.indexOf("pl-under"));
      expect(calls).toBe(0);
    } finally {
      premiumCardReadsService.career = original;
    }
  });

  it("non-member: no value from a member's paid read is in the markup", async () => {
    const client = new QueryClient();
    // Even with a member's career sitting in the cache, a locked render never shows it.
    client.setQueryData(premiumCardKeys.career(null), distinctCareer());
    const html = await render(<PlusSeasonSection access="locked" standing={standing} />, client);
    const visible = text(html);
    for (const w of distinctCareer().weeks) expect(visible).not.toContain(`>${w.score}<`);
    expect(html).not.toContain("301");
  });

  it("member: clear, no lock, four tabs, real figures and no dash for what the backend lacks", async () => {
    const client = new QueryClient();
    const career = distinctCareer();
    client.setQueryData(premiumCardKeys.career(null), career);
    const html = await render(<PlusSeasonSection access="member" />, client);
    const total = career.weeks.reduce((n, w) => n + w.score, 0);
    expect(html).toContain('data-testid="plus-season-member"');
    expect(html).not.toContain("pl-lock");
    expect(html).not.toContain("inert");
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(text(html)).toContain(String(total));
    expect(text(html)).not.toContain("—");
    expect(html).not.toContain("NaN");
  });

  it("feature off: nothing", async () => {
    expect(await render(<PlusSeasonSection access="off" />)).not.toContain("plus-season");
  });
});

describe("« Détail du duel » in the face-à-face", () => {
  const mine = { name: "Moi", totalScore: 612, rank: 3 };
  const other = { name: "Yassine", totalScore: 598, rank: 4 };

  it("non-member: both real standings clear, example blurred, unlock to the paywall", async () => {
    const html = await render(
      <PlusDuelSection access="locked" mine={mine} other={other} otherTeamId="t2" size={5} />,
    );
    const visible = text(html);
    expect(html).toContain('data-testid="plus-duel-locked"');
    expect(visible).toContain("612");
    expect(visible).toContain("598");
    expect(visible).toContain("Yassine");
    expect(visible).toContain(fr["plus.in.duel_title"]);
    expect(html).toContain('href="/curva/plus?step=3&amp;via=duel"');
    expect(html).toMatch(/aria-hidden="true" inert=""/);
  });

  it("member: the duel is clear, from the read", async () => {
    const client = new QueryClient();
    const duel: DuelMember = mockDuel("t2");
    client.setQueryData(premiumCardKeys.duel(null, "t2"), duel);
    const html = await render(
      <PlusDuelSection access="member" mine={mine} other={other} otherTeamId="t2" size={5} />,
      client,
    );
    expect(html).toContain('data-testid="plus-duel-member"');
    expect(html).not.toContain("pl-lock");
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).not.toContain("NaN");
  });

  it("member: a hidden history is a short line, not a broken chart", async () => {
    const client = new QueryClient();
    const duel = mockDuel("t2");
    client.setQueryData(premiumCardKeys.duel(null, "t2"), {
      ...duel,
      weeks: [],
      summary: null,
      opponent: { ...duel.opponent, historyVisible: false },
    });
    const html = await render(
      <PlusDuelSection access="member" mine={mine} other={other} otherTeamId="t2" size={5} />,
      client,
    );
    expect(text(html)).toContain(fr["plus.in.duel_private"]);
    expect(html).not.toContain('role="tab"');
  });

  it("feature off: nothing, through the real slot too", async () => {
    expect(
      await render(
        <PlusDuelSection access="off" mine={mine} other={other} otherTeamId="t2" size={5} />,
      ),
    ).not.toContain("plus-duel");
  });
});

describe("the member mark and the header logo", () => {
  it("feature off: nothing", async () => {
    expect(await render(<PlusMemberMark />)).not.toContain("pl-mark");
  });
  it("the member's logo is the logo, with the name only in its spoken label", async () => {
    const html = await render(<PlusHeaderLogo />);
    expect(html).toContain("plus-logo");
    expect(text(html)).not.toContain("BotolaGO+");
    expect(html).toContain('aria-label="Membre BotolaGO+"');
  });
});

describe("the member mapper", () => {
  it("maps the career into the screens' shape, with the unserved figures missing", () => {
    const c = distinctCareer();
    const view = careerToSeasonView(c)!;
    expect(view.J).toBe(11);
    expect(view.S.total).toBe(c.weeks.reduce((n, w) => n + w.score, 0));
    expect(Number.isNaN(view.S.leagueTotal)).toBe(true);
    expect(Number.isNaN(view.raw.leaderTotal)).toBe(true);
    expect(view.S.ovr).toBe(c.weeks[10]!.ovr!);
    expect(view.S.bestChoiceWeeks).toBe(c.captain.hits);
  });
  it("has nothing to draw before the first journée", () => {
    expect(careerToSeasonView({ ...mockCareer(), weeks: [] })).toBeNull();
  });
  it("maps the duel, and refuses a history the opponent keeps private", () => {
    const d = mockDuel("t2");
    const view = duelToSeasonView(d, "fr", { you: "Moi", rival: "Yassine" })!;
    expect(view.raw.rival).toHaveLength(d.weeks.length);
    expect(view.people?.rival.name).toBe("Yassine");
    expect(
      duelToSeasonView({ ...d, opponent: { ...d.opponent, historyVisible: false } }, "fr", {
        you: "a",
        rival: "b",
      }),
    ).toBeNull();
  });
});

describe("the words", () => {
  const keys = Object.keys(fr).filter((k) => k.startsWith("plus.in."));
  it("exist in French and Arabic", () => {
    expect(keys.length).toBeGreaterThanOrEqual(9);
    for (const k of keys) {
      expect((ar as Record<string, string>)[k], k).toBeTruthy();
    }
  });
  it("never type the product name or an arrow, and keep to « vous »", () => {
    for (const k of keys) {
      const value = (fr as Record<string, string>)[k]!;
      if (k === "plus.in.member_aria") continue; // the spoken label takes the name as a value
      expect(value, k).not.toContain("BotolaGO+");
      expect(value, k).not.toMatch(/[→←⟶➜]|->/);
      expect(value, k).not.toMatch(/\btu\b|\bton\b|\bta\b/i);
    }
  });
});

describe("Curva's home: « Votre saison » and « Votre duel » in place", () => {
  const mine = { name: "Moi", totalScore: 612, rank: 3 };
  const other = { name: "Yassine", totalScore: 598, rank: 4 };

  it("non-member: the season is a locked strip with the real points clear and Découvrir", async () => {
    const html = await render(
      <PlusHomeSeason access="locked" standing={standing} leagueId={null} leaguePending={false} />,
    );
    expect(html).toContain('data-testid="plus-home-season-locked"');
    expect(html).toContain("pl-stage--compact");
    expect(text(html)).toContain("612");
    expect(text(html)).toContain(fr["plus.in.unlock"]);
    expect(html).toContain('href="/curva/plus?step=3&amp;via=season"');
    expect(html).toMatch(/class="pl-under[^"]*" aria-hidden="true" inert=""/);
  });

  it("non-member: the duel is a locked strip with the score against the rival and via=duel", async () => {
    const html = await render(
      <PlusHomeDuel
        access="locked"
        mine={mine}
        other={other}
        otherTeamId="t2"
        size={5}
        leagueId={null}
      />,
    );
    expect(html).toContain('data-testid="plus-home-duel-locked"');
    expect(text(html)).toContain("612");
    expect(text(html)).toContain("598");
    expect(html).toContain('href="/curva/plus?step=3&amp;via=duel"');
  });

  it("member: real and compact, no lock and no blur, a way to the full screen", async () => {
    const client = new QueryClient();
    client.setQueryData(premiumCardKeys.career(null), distinctCareer());
    const html = await render(
      <PlusHomeSeason access="member" standing={null} leagueId={null} leaguePending={false} />,
      client,
    );
    const total = distinctCareer().weeks.reduce((n, w) => n + w.score, 0);
    expect(html).toContain('data-testid="plus-home-season-member"');
    expect(html).toContain('data-testid="plus-home-season-all"');
    expect(text(html)).toContain(fr["plus.home.season_all"]);
    expect(text(html)).toContain(String(total));
    expect(html).not.toContain("pl-lock");
    expect(html).not.toContain("inert");
    expect(text(html)).not.toContain("—");
    expect(html).not.toContain("NaN");
  });

  it("feature off: neither block draws anything", async () => {
    expect(
      await render(
        <PlusHomeSeason access="off" standing={standing} leagueId={null} leaguePending={false} />,
      ),
    ).not.toContain("plus-home");
    expect(
      await render(
        <PlusHomeDuel
          access="off"
          mine={mine}
          other={other}
          otherTeamId="t2"
          size={5}
          leagueId={null}
        />,
      ),
    ).not.toContain("plus-home");
  });
});
