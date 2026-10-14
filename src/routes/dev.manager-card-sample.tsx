import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { CardStage, RatingLine } from "@/components/curva/CardStage";
import { cardView, roundBlock, waitingBox } from "@/components/curva/curva-state";
import { IdentityLine } from "@/components/curva/IdentityLine";
import { pendingFacts, showsPendingPanel } from "@/components/curva/pending-card";
import type { PeopleRow } from "@/components/curva/people";
import { RoundGlance } from "@/components/curva/RoundGlance";
import { StatTiles } from "@/components/curva/StatTiles";
import { useMomentCopy } from "@/components/manager-card/copy";
import { fromMyCard } from "@/components/manager-card/to-profile";
import { CARD_EDITIONS } from "@/backend/manager-card/contracts";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * A SAMPLE of the Manager Card on the Curva home, for browser tests and for looking at it.
 * Development servers only: anywhere else this route is "not found", so it is never a page a
 * visitor or a crawler can reach.
 *
 * Everything on it is invented and built in this file. No database,
 * no network, no Supabase client.
 *
 *   ?case=two   two of the four statistics filled, every journée counted (the box « 2/4 »)
 *   ?case=full  four of four with a first rating
 *   ?case=zero  a new manager: nothing counted yet
 *   ?lang=fr|ar
 *   ?edition=standard|holo|electric|pixel|chrome   draws the card in that edition (BotolaGO+)
 *   ?tier=pro|legend   (with case=full) the earned tier of the card
 */
type Edition = (typeof CARD_EDITIONS)[number];
type Search = {
  case?: "two" | "full" | "zero";
  lang?: "fr" | "ar";
  edition?: Edition;
  tier?: "pro" | "legend";
  name?: string;
};

export const Route = createFileRoute("/dev/manager-card-sample")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.case === "two" || search.case === "full" || search.case === "zero"
      ? { case: search.case }
      : {}),
    ...(search.lang === "ar" || search.lang === "fr" ? { lang: search.lang } : {}),
    ...(CARD_EDITIONS.includes(search.edition as Edition)
      ? { edition: search.edition as Edition }
      : {}),
    ...(search.tier === "pro" || search.tier === "legend" ? { tier: search.tier } : {}),
    ...(typeof search.name === "string" && search.name.trim()
      ? { name: search.name.trim().slice(0, 40) }
      : {}),
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: SampleHarness,
});

/** An invented next round, far enough ahead that the sample never shows a past deadline. */
const SAMPLE_ROUND = { number: 8, deadline: "2099-10-17T16:30:00Z" };

/** An invented league of twelve in which the sample's team stands third with 214 points. */
const SAMPLE_ROWS: PeopleRow[] = Array.from({ length: 12 }, (_, i) => ({
  standing: {
    managerId: i === 2 ? "sample-own" : `sample-${i}`,
    managerName: `Manager ${i + 1}`,
    teamName: `Team ${i + 1}`,
    rank: i + 1,
    previousRank: i + 1,
    gameweekScore: 40,
    totalScore: 230 - i * 8,
  },
  card: null,
  own: i === 2,
  name: `Manager ${i + 1}`,
}));

const stat = (
  value: number | null,
  nullReason: MyCardDto["stats"]["cap"]["nullReason"] = null,
) => ({
  value,
  nullReason,
});

/**
 * An invented card. Built here and not from `backend/manager-card/fixtures.ts`, which a production
 * build must not contain (`scripts/qa/manager-card-fixture-gate.ts`).
 */
function baseCard(over: Partial<MyCardDto>): MyCardDto {
  return {
    teamId: "3c000002-0000-4000-8000-000000000001",
    name: "Sami",
    handle: null,
    season: { id: "3c000001-0000-4000-8000-000000000001", label: "2026/27" },
    serial: "482913",
    founder: null,
    club: {
      id: "3c000003-0000-4000-8000-000000000002",
      slug: "wydad-ac",
      code: "WAC",
      name: { fr: "Wydad AC", ar: "الوداد الرياضي" },
      shortName: { fr: "Wydad", ar: "الوداد" },
      city: null,
      primaryColor: null,
      secondaryColor: null,
    },
    ratingState: "forming",
    ovr: null,
    ovrNullReason: "pending_minimum",
    tier: null,
    bestTier: null,
    nextTier: null,
    provisional: false,
    stats: {
      cap: stat(null, "pending_minimum"),
      sel: stat(null, "pending_minimum"),
      trf: stat(null, "pending_minimum"),
      con: stat(null, "pending_minimum"),
    },
    gameweeksCounted: 0,
    minRated: 3,
    minConfirmed: 5,
    rulesVersion: "v1",
    throughGameweekSeq: null,
    calculatedAt: null,
    firstCountedGameweekSeq: null,
    firstRatedGameweekSeq: null,
    ratingGameweeks: [5, 6, 7],
    ratingGameweeksComplete: true,
    previousSeason: null,
    seasonClosed: false,
    seasons: [],
    createdAt: "2026-09-28T10:00:00Z",
    moments: [],
    ...over,
  };
}

function sampleCard(which: "two" | "full" | "zero", tier: "pro" | "legend" = "pro"): MyCardDto {
  if (which === "full") {
    const legend = tier === "legend";
    return baseCard({
      ratingState: "provisional",
      ovr: legend ? 97 : 84,
      ovrNullReason: null,
      tier,
      bestTier: tier,
      nextTier: legend ? null : { code: "champion", fromOvr: 88 },
      provisional: true,
      stats: { cap: stat(91), sel: stat(82), trf: stat(86), con: stat(78) },
      gameweeksCounted: 3,
      throughGameweekSeq: 7,
      firstCountedGameweekSeq: 5,
      firstRatedGameweekSeq: 7,
    });
  }
  if (which === "zero") return baseCard({});
  return baseCard({
    ratingState: "insufficient",
    ovrNullReason: "too_few_stats",
    gameweeksCounted: 3,
    throughGameweekSeq: 7,
    firstCountedGameweekSeq: 1,
    stats: {
      cap: stat(null, "pre_captain_fix"),
      sel: stat(99),
      trf: stat(null, "no_transfers"),
      con: stat(99),
    },
  });
}

function SampleHarness() {
  const search = Route.useSearch();
  const { setLanguage, lang, dir } = useI18n();
  const wanted = search.lang ?? "fr";
  useEffect(() => {
    if (lang !== wanted) setLanguage(wanted);
  }, [lang, wanted, setLanguage]);
  const card = {
    ...sampleCard(search.case ?? "two", search.tier),
    ...(search.edition ? { edition: search.edition } : {}),
    ...(search.name ? { name: search.name } : {}),
  };
  return (
    <div className={cn("min-h-dvh", ui.surface.page)} dir={dir} data-testid="sample-root">
      <p className={cn("px-4 pt-2", ui.text.meta)} data-testid="sample-harness">
        SAMPLE DATA · not production
      </p>
      <Owner card={card} />
    </div>
  );
}

function Owner({ card }: { card: MyCardDto }) {
  const moments = useMomentCopy();
  const view = cardView(card);
  const profile = fromMyCard(card);
  return (
    <div className="pb-2 md:mx-auto md:grid md:max-w-5xl md:grid-cols-[352px_minmax(0,1fr)] md:gap-x-6 md:px-6">
      <div className="md:sticky md:top-4 md:self-start">
        <CardStage
          profile={profile}
          fitHeight
          flippable
          waiting={waitingBox(view.ovr, card.gameweeksCounted, card.minRated)}
        >
          <RatingLine
            ovr={view.ovr}
            tier={view.tier}
            provisional={card.provisional && !view.newSeason}
            counted={card.gameweeksCounted}
            min={card.minRated}
            statsFilled={view.statsFilled}
            formingLabel={moments.m3.label}
            closedSeason={card.seasonClosed ? card.season.label : null}
          />
        </CardStage>
        <div className="mt-1 px-4">
          <IdentityLine
            since={card.firstCountedGameweekSeq}
            founder={view.founder}
            club={card.club?.shortName.fr ?? null}
            leagueCount={1}
          />
        </div>
        <RoundGlance round={SAMPLE_ROUND} composeLabel="Composer l'équipe" />
      </div>
      <div className={cn("mt-5 flex min-w-0 flex-col gap-5 px-4 md:mt-0 md:px-0 md:pt-5")}>
        <StatTiles
          card={card}
          facts={
            showsPendingPanel(card, roundBlock(card, { gameweek: null, now: Date.now() }))
              ? pendingFacts(card, SAMPLE_ROWS, SAMPLE_ROWS.length)
              : null
          }
        />
      </div>
    </div>
  );
}
