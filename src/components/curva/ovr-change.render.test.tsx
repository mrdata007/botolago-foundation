import { afterAll, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { FIXTURES } from "@/backend/manager-card/fixtures";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

/**
 * What the server draws for a card with an unseen rating change, in French and Arabic. The server
 * never plays anything: it draws the finished state (the card's own number, no glow, the history
 * chip if any), and the client counts after hydration (`useOvrChangeBeat`). The module is put back
 * once the file is done (`src/test-isolation.test.ts`).
 */

const realI18n = { ...(await import("@/i18n/provider")) };
let language: Language = "fr";
mock.module("@/i18n/provider", () => ({
  ...realI18n,
  useI18n: () => {
    const real = realI18n.useI18n();
    const dictionary = dictionaries[language];
    return {
      ...real,
      lang: language,
      dir: language === "ar" ? "rtl" : "ltr",
      t: (key: TranslationKey) => dictionary[key],
    };
  },
}));
afterAll(() => {
  mock.module("@/i18n/provider", () => realI18n);
});

const { AuthProvider } = await import("@/auth/AuthProvider");
const { FantasyOwnedProvider } = await import("@/services/fantasy-owned-provider");
const { CardStage, RatingLine } = await import("./CardStage");
const { useOvrChangeBeat } = await import("./use-ovr-change");
const { cardView } = await import("./curva-state");
const { fromMyCard } = await import("@/components/manager-card/to-profile");

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AuthProvider>
          <FantasyOwnedProvider>{node}</FantasyOwnedProvider>
        </AuthProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/curva"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <realI18n.I18nProvider>
        <RouterProvider router={router} />
      </realI18n.I18nProvider>
    </QueryClientProvider>,
  )
    .replace(/<!-- -->/g, "")
    .replace(/[⁦-⁩]/g, "");
}

const rated = FIXTURES.rated.card!;
const card: MyCardDto = {
  ...rated,
  ovrChanges: [
    {
      kind: "ovr_changed",
      key: "ovr_up:3c000004-0000-4000-8000-000000000003",
      direction: "up",
      occurredAt: "2026-10-12T20:00:00Z",
      gameweekSeq: 3,
      fromOvr: rated.ovr! - 4,
      toOvr: rated.ovr!,
      delta: 4,
      fromTier: rated.tier,
      toTier: rated.tier,
    },
  ],
};

function Harness({ acked }: { acked: string[] }) {
  const view = cardView(card);
  const change = useOvrChangeBeat({
    card,
    ovr: view.ovr,
    acknowledge: async (keys) => {
      acked.push(...keys);
    },
  });
  return (
    <CardStage profile={fromMyCard(card)} glow={change.glow} countOvr={change.shownOvr}>
      <RatingLine
        ovr={change.shownOvr}
        tier={view.tier}
        provisional={card.provisional}
        counted={card.gameweeksCounted}
        min={card.minRated}
        statsFilled={view.statsFilled}
        formingLabel="—"
        change={change.badge}
      />
    </CardStage>
  );
}

const LANGUAGES: Language[] = ["fr", "ar"];

describe("a card with an unseen rating change, drawn on the server", () => {
  for (const lang of LANGUAGES) {
    it(`${lang}: the card's own number, the provisional pill, no glow, no chip, nothing acknowledged`, async () => {
      language = lang;
      const acked: string[] = [];
      const html = await render(<Harness acked={acked} />);
      expect(html).toMatch(
        new RegExp(`data-testid="curva-rating-ovr"[^>]*>(<[^>]+>)*${card.ovr}<`),
      );
      expect(html).toContain('data-stage-glow="off"');
      expect(html).toContain("opacity-0");
      expect(html).not.toContain('data-testid="curva-rating-change"');
      expect(html).toContain(dictionaries[lang]["card.provisional"]);
      expect(acked).toEqual([]);
      language = "fr";
    });
  }

  it("ar: the chip a change draws keeps « +4 ▲ » left to right, with the Arabic sentence for a screen reader", async () => {
    language = "ar";
    const html = await render(
      <RatingLine
        ovr={62}
        tier="stade"
        provisional
        counted={3}
        min={1}
        statsFilled={4}
        formingLabel="—"
        change={{ delta: 4, pop: true }}
      />,
    );
    expect(html).toMatch(/<bdi dir="ltr" aria-hidden="true">\+4 ▲<\/bdi>/);
    expect(html).toContain('data-change="up"');
    expect(html).toContain('data-pop="1"');
    expect(html).toContain("ارتفع");
    language = "fr";
  });

  it("fr: a fall draws « −3 ▼ » with the unicode minus, in the negative tone", async () => {
    language = "fr";
    const html = await render(
      <RatingLine
        ovr={63}
        tier="stade"
        provisional={false}
        counted={6}
        min={1}
        statsFilled={4}
        formingLabel="—"
        change={{ delta: -3, pop: false }}
      />,
    );
    expect(html).toMatch(/<bdi dir="ltr" aria-hidden="true">−3 ▼<\/bdi>/);
    expect(html).toContain('data-change="down"');
    expect(html).toContain("note en baisse de 3");
  });

  it("the stage draws the halo layer behind the card, lit in the tone of the change", async () => {
    const profile = fromMyCard(card);
    const up = await render(<CardStage profile={profile} glow="up" />);
    const down = await render(<CardStage profile={profile} glow="down" />);
    expect(up).toContain('data-stage-glow="up"');
    expect(up).toContain("var(--ui-positive)");
    expect(down).toContain('data-stage-glow="down"');
    expect(down).toContain("var(--ui-negative)");
    expect(up).toContain("opacity-100");
  });
});
