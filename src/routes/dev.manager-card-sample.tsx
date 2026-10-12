import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { FIXTURES } from "@/backend/manager-card/fixtures";
import { CardStage, RatingLine } from "@/components/curva/CardStage";
import { cardView, waitingBox } from "@/components/curva/curva-state";
import { IdentityLine } from "@/components/curva/IdentityLine";
import { RoundGlance } from "@/components/curva/RoundGlance";
import { StatTiles } from "@/components/curva/StatTiles";
import { useMomentCopy } from "@/components/manager-card/copy";
import { fromMyCard } from "@/components/manager-card/to-profile";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * A SAMPLE of the Manager Card on the Curva home, for browser tests and for looking at it.
 * Development servers only: anywhere else this route is "not found", so it is never a page a
 * visitor or a crawler can reach.
 *
 * Everything on it is invented (the fixtures of `backend/manager-card/fixtures.ts`). No database,
 * no network, no Supabase client.
 *
 *   ?case=two   two of the four statistics filled, every journée counted (the box « 2/4 »)
 *   ?case=full  four of four with a first rating
 *   ?case=zero  a new manager: nothing counted yet
 *   ?lang=fr|ar
 */
type Search = { case?: "two" | "full" | "zero"; lang?: "fr" | "ar" };

export const Route = createFileRoute("/dev/manager-card-sample")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.case === "two" || search.case === "full" || search.case === "zero"
      ? { case: search.case }
      : {}),
    ...(search.lang === "ar" || search.lang === "fr" ? { lang: search.lang } : {}),
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: SampleHarness,
});

/** An invented next round, far enough ahead that the sample never shows a past deadline. */
const SAMPLE_ROUND = { number: 8, deadline: "2099-10-17T16:30:00Z" };

function sampleCard(which: "two" | "full" | "zero"): MyCardDto {
  if (which === "full") return FIXTURES.rated.card!;
  if (which === "zero") return FIXTURES.born0.card!;
  return {
    ...FIXTURES.insufficient3.card!,
    stats: {
      cap: { value: null, nullReason: "pre_captain_fix" },
      sel: { value: 99, nullReason: null },
      trf: { value: null, nullReason: "no_transfers" },
      con: { value: 99, nullReason: null },
    },
  };
}

function SampleHarness() {
  const search = Route.useSearch();
  const { setLanguage, lang, dir } = useI18n();
  const wanted = search.lang ?? "fr";
  useEffect(() => {
    if (lang !== wanted) setLanguage(wanted);
  }, [lang, wanted, setLanguage]);
  const card = sampleCard(search.case ?? "two");
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
        <StatTiles card={card} />
      </div>
    </div>
  );
}
