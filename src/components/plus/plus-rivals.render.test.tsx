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
import { rivalsMemberSchema } from "@/backend/premium/rivals";
import { MockPremiumRivalsRepository } from "@/backend/premium/rivals-mock";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { premiumRivalsService } from "@/services/premium-rivals";

import { BoardView, PlusRivals } from "./PlusRivals";
import { exampleRivals } from "./plus-rivals-example";
import { bilanText, formatDay, gapLine, shareMessage, stampText } from "./plus-rivals-text";

const { fr, ar } = dictionaries;
const t = (key: keyof typeof fr) => fr[key];
const tAr = (key: keyof typeof ar) => ar[key];

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/curva"] }),
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
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

async function board() {
  const answer = await new MockPremiumRivalsRepository().myRivals({
    actorId: null,
    requestId: "t",
  });
  return rivalsMemberSchema.parse(answer);
}

describe("« Vos rivaux », the three states", () => {
  it("off: nothing at all, no node and no request", async () => {
    let calls = 0;
    const original = premiumRivalsService.myRivals;
    premiumRivalsService.myRivals = (async () => {
      calls++;
      return { available: false };
    }) as typeof original;
    try {
      const html = await render(<PlusRivals access="off" mine={null} closest={null} size={5} />);
      expect(html).not.toContain("plus-rivals");
      expect(html).not.toContain("pr-");
      expect(calls).toBe(0);
    } finally {
      premiumRivalsService.myRivals = original;
    }
  });

  it("locked: the real points clear, the example blurred and inert, the limits, one way in, no paid read", async () => {
    let calls = 0;
    const original = premiumRivalsService.myRivals;
    premiumRivalsService.myRivals = (async () => {
      calls++;
      return { available: true, locked: true };
    }) as typeof original;
    try {
      const html = await render(
        <PlusRivals
          access="locked"
          mine={{ name: "Karim B.", totalScore: 612, rank: 3 }}
          closest={{ name: "Sami Berrada", totalScore: 598, rank: 4 }}
          size={5}
        />,
      );
      const visible = text(html);
      expect(html).toContain('data-testid="plus-home-rivals-locked"');
      expect(html).toContain('data-testid="plus-rivals-real"');
      expect(visible).toContain("612");
      expect(visible).toContain("598");
      expect(visible).toContain("Vous menez de 14 pts");
      expect(visible).toContain(t("plus.rv.locked_title"));
      expect(visible).toContain(t("plus.in.unlock"));
      expect(html).toContain("pl-under");
      expect(html).toMatch(/pl-under[^>]*aria-hidden="true"[^>]*inert/);
      // the limits are said before the subscription
      expect(visible).toContain(t("plus.rv.limit"));
      expect(visible).toContain(t("plus.rv.privacy"));
      expect(visible).toContain(t("plus.rv.foot_live"));
      // the example shows nothing of the reader's own: no member figure, no switch to press
      expect(html).not.toContain('data-testid="plus-rivals-member"');
      expect(html).not.toContain('data-testid="plus-rival-poster"');
      expect(calls).toBe(0);
    } finally {
      premiumRivalsService.myRivals = original;
    }
  });

  it("locked, with no league mate to compare with: the example and the limits, no real head", async () => {
    const html = await render(<PlusRivals access="locked" mine={null} closest={null} size={0} />);
    expect(html).toContain('data-testid="plus-home-rivals-locked"');
    expect(html).not.toContain('data-testid="plus-rivals-real"');
  });
});

describe("the board a member reads", () => {
  it("draws one poster each, by full name, with the published stamp and the notification off", async () => {
    const data = await board();
    const html = await render(
      <BoardView
        me={{ name: data.me!.name!, total: data.me!.total }}
        rank={3}
        size={5}
        rivals={data.rivals}
        notify={false}
        candidates={[]}
      />,
    );
    const visible = text(html);
    expect(html.match(/data-testid="plus-rival-poster"/g)).toHaveLength(2);
    expect(visible).toContain("Sami Berrada");
    expect(visible).toContain("Yassine Ouazzani");
    expect(visible).toContain("Journée 11 · Publié le 12 oct.");
    expect(visible).toContain("Journée 11 : vous gagnez 62 à 58");
    expect(visible).toContain("Bilan : 7 victoires, 4 défaites");
    expect(visible).toMatch(/Plus grand écart : \+7 \(J9, 71 – 64 \)/);
    expect(visible).toContain("Yassine Ouazzani vous passe devant : 627 contre 612");
    expect(visible).toContain("612 pts · 3e sur 5");
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    // eleven numbered tiles, won or lost
    expect(html.match(/pr-t-w/g)!.length).toBeGreaterThanOrEqual(12);
  });

  it("a friend who keeps their history private shows no captain and no transfer; one who shares shows both, the transfer « en attente »", async () => {
    const data = await board();
    const html = await render(
      <BoardView
        me={{ name: "Karim B.", total: 612 }}
        rank={null}
        size={null}
        rivals={data.rivals}
        notify={false}
        candidates={[]}
      />,
    );
    const visible = text(html);
    expect(visible).toContain("Sami Berrada garde son historique privé.");
    expect(visible).toContain("Yassine Ouazzani partage son historique.");
    expect(visible).toContain("Capitaines J11");
    expect(visible).toContain("M. Tahiri");
    expect(visible).toContain("A. Chakir");
    expect(visible).toContain("20 pts");
    expect(visible).toContain("S. Idrissi");
    expect(visible).toContain(t("plus.rv.pending"));
    // the private friend's captain is nowhere
    expect(html.split("pr-poster")[1]).not.toContain("pr-caps");
  });

  it("never shows a rating, a serial, an absence list or the word « provisoire »", async () => {
    const data = await board();
    const html = await render(
      <BoardView
        me={{ name: "Karim B.", total: 612 }}
        rank={3}
        size={5}
        rivals={data.rivals}
        notify
        candidates={[]}
      />,
    );
    const visible = text(html);
    expect(visible.toLowerCase()).not.toContain("provisoire");
    expect(visible).not.toMatch(/OVR|BOT #|n° \d|blessé|suspendu/);
    expect(html).toContain('aria-checked="true"');
  });

  it("offers the empty place with the league mates, until three are pinned", async () => {
    const data = await board();
    const withAdd = await render(
      <BoardView
        me={{ name: "Karim B.", total: 612 }}
        rank={null}
        size={null}
        rivals={data.rivals}
        notify={false}
        candidates={[
          {
            teamId: "00000000-0000-4000-8000-000000000803",
            name: "Hamza Tazi",
            league: data.rivals[0]!.league,
          },
        ]}
      />,
    );
    expect(withAdd).toContain('data-testid="plus-rivals-add"');
    expect(text(withAdd)).toContain("Hamza Tazi");
    expect(text(withAdd)).toContain(t("plus.rv.add"));
    const full = await render(
      <BoardView
        me={{ name: "Karim B.", total: 612 }}
        rank={null}
        size={null}
        rivals={[
          ...data.rivals,
          { ...data.rivals[0]!, teamId: "00000000-0000-4000-8000-000000000809", position: 3 },
        ]}
        notify={false}
        candidates={[]}
      />,
    );
    expect(full).not.toContain('data-testid="plus-rivals-add"');
    expect(text(full)).toContain(t("plus.rv.foot_full"));
  });

  it("is the example under the blur: no share, no remove, no add, nothing to press", async () => {
    const html = await render(
      <BoardView
        me={{ name: "Karim B.", total: 612 }}
        rank={null}
        size={null}
        rivals={exampleRivals("Sami", "Yassine")}
        notify={false}
        candidates={[]}
        example
      />,
    );
    expect(html).not.toContain("pr-btn--wa");
    expect(html).not.toContain("plus-rival-remove");
    expect(html).not.toContain('data-testid="plus-rivals-add"');
    expect(html).toMatch(/role="switch"[^>]*disabled/);
  });
});

describe("the words", () => {
  it("writes the stamp, the gap and the WhatsApp sentence in French", async () => {
    const data = await board();
    const [sami, yassine] = data.rivals;
    expect(formatDay("fr", "2026-10-12T18:00:00+00:00")).toBe("12 oct.");
    expect(stampText((k) => fr[k], "fr", sami!)).toBe("Journée 11 · Publié le 12 oct.");
    expect(gapLine((k) => fr[k], sami!)).toBe("Vous menez de 14 pts");
    expect(gapLine((k) => fr[k], yassine!)).toBe("Yassine Ouazzani mène de 15 pts");
    expect(shareMessage((k) => fr[k], sami!)).toBe(
      "Journée 11 : 62 contre 58. Au total, je mène de 14 pts sur Sami Berrada.",
    );
    expect(shareMessage((k) => fr[k], yassine!)).toBe(
      "Journée 11 : 62 contre 79. Au total, Yassine Ouazzani mène de 15 pts.",
    );
  });

  it("writes the tally with the right agreement in French and Arabic", () => {
    const f = (k: keyof typeof fr) => fr[k];
    const a = (k: keyof typeof ar) => ar[k];
    expect(bilanText(f, "fr", { won: 1, lost: 0, tied: 0 })).toBe("Bilan : 1 victoire, 0 défaites");
    expect(bilanText(f, "fr", { won: 7, lost: 4, tied: 2 })).toBe(
      "Bilan : 7 victoires, 4 défaites, 2 nuls",
    );
    expect(bilanText(a, "ar", { won: 2, lost: 3, tied: 0 })).toContain("انتصاران");
    expect(bilanText(a, "ar", { won: 7, lost: 11, tied: 0 })).toMatch(/11.{0,2} هزيمة/);
  });

  it("keeps Western digits and the Gregorian calendar in Arabic", () => {
    expect(formatDay("ar", "2026-10-12T18:00:00+00:00")).toBe("12 أكتوبر");
    expect(tAr("plus.rv.share")).toBe("شارك على واتساب");
  });
});
