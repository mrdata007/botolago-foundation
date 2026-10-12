import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { CardStage, RatingLine } from "@/components/curva/CardStage";
import { cardView } from "@/components/curva/curva-state";
import { useOvrChangeBeat } from "@/components/curva/use-ovr-change";
import { useMomentCopy } from "@/components/manager-card/copy";
import { fromMyCard } from "@/components/manager-card/to-profile";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * A SAMPLE of the rating change on the Curva card (brief `MANAGER_CARD_OVR_CHANGE_BRIEF.md`), for
 * browser tests and screenshots. Development servers only: anywhere else this route is "not found",
 * so it is never a page a visitor or a crawler can reach (the guard of `/dev/manager-card-sample`).
 *
 * Everything on it is invented and built in this file. No database, no network, no Supabase
 * client; the acknowledgement is recorded on the page instead of being sent.
 *
 *   ?dir=up    58 -> 62, provisional (the default)
 *   ?dir=down  66 -> 63, rated
 *   ?lang=fr|ar
 *   ?replay=1  a « Rejouer » button, to play the change again
 */
type Search = { dir?: "up" | "down"; lang?: "fr" | "ar"; replay?: "1" };

export const Route = createFileRoute("/dev/manager-card-ovr-change-sample")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.dir === "up" || search.dir === "down" ? { dir: search.dir } : {}),
    ...(search.lang === "ar" || search.lang === "fr" ? { lang: search.lang } : {}),
    ...(search.replay === "1" ? { replay: "1" as const } : {}),
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: SampleHarness,
});

const stat = (value: number) => ({ value, nullReason: null });

/** An invented card with an unseen rating change. */
function sampleCard(dir: "up" | "down"): MyCardDto {
  const up = dir === "up";
  const from = up ? 58 : 66;
  const to = up ? 62 : 63;
  return {
    teamId: "3c000002-0000-4000-8000-000000000011",
    name: "Sami",
    handle: null,
    season: { id: "3c000001-0000-4000-8000-000000000011", label: "2026/27" },
    serial: "482913",
    founder: null,
    club: {
      id: "3c000003-0000-4000-8000-000000000012",
      slug: "wydad-ac",
      code: "WAC",
      name: { fr: "Wydad AC", ar: "الوداد الرياضي" },
      shortName: { fr: "Wydad", ar: "الوداد" },
      city: null,
      primaryColor: null,
      secondaryColor: null,
    },
    ratingState: up ? "provisional" : "rated",
    ovr: to,
    ovrNullReason: null,
    tier: "stade",
    bestTier: "stade",
    nextTier: { code: "pro", fromOvr: 65 },
    provisional: up,
    stats: up
      ? { cap: stat(63), sel: stat(71), trf: stat(50), con: stat(57) }
      : { cap: stat(60), sel: stat(70), trf: stat(58), con: stat(64) },
    gameweeksCounted: up ? 3 : 6,
    minRated: 1,
    minConfirmed: 5,
    rulesVersion: "v3",
    throughGameweekSeq: up ? 3 : 6,
    calculatedAt: "2026-10-12T20:00:00Z",
    firstCountedGameweekSeq: 1,
    firstRatedGameweekSeq: 1,
    ratingGameweeks: null,
    ratingGameweeksComplete: false,
    previousSeason: null,
    seasonClosed: false,
    seasons: [],
    createdAt: "2026-09-28T10:00:00Z",
    moments: [],
    ovrChanges: [
      {
        kind: "ovr_changed",
        key: `ovr_${dir}:3c000004-0000-4000-8000-00000000000${up ? 3 : 6}`,
        direction: dir,
        occurredAt: "2026-10-12T20:00:00Z",
        gameweekSeq: up ? 3 : 6,
        fromOvr: from,
        toOvr: to,
        delta: to - from,
        fromTier: "stade",
        toTier: "stade",
      },
    ],
  };
}

function SampleHarness() {
  const search = Route.useSearch();
  const { setLanguage, lang, dir } = useI18n();
  const wanted = search.lang ?? "fr";
  useEffect(() => {
    if (lang !== wanted) setLanguage(wanted);
  }, [lang, wanted, setLanguage]);
  const [run, setRun] = useState(0);
  return (
    <div className={cn("min-h-dvh", ui.surface.page)} dir={dir} data-testid="sample-root">
      <p className={cn("px-4 pt-2", ui.text.meta)} data-testid="sample-harness">
        SAMPLE DATA · not production
      </p>
      <Owner key={run} card={sampleCard(search.dir ?? "up")} />
      {search.replay ? (
        <button type="button" className="mx-4 underline" onClick={() => setRun((n) => n + 1)}>
          Rejouer
        </button>
      ) : null}
    </div>
  );
}

function Owner({ card }: { card: MyCardDto }) {
  const moments = useMomentCopy();
  const view = cardView(card);
  const profile = fromMyCard(card);
  const [acked, setAcked] = useState<string[]>([]);
  const acknowledge = useCallback(async (keys: readonly string[]) => {
    setAcked((all) => [...all, ...keys]);
  }, []);
  const change = useOvrChangeBeat({ card, ovr: view.ovr, acknowledge });
  return (
    <div className="pb-2 md:mx-auto md:max-w-[352px]">
      <CardStage
        profile={profile}
        fitHeight
        flippable
        glow={change.glow}
        countOvr={change.shownOvr}
      >
        <RatingLine
          ovr={change.shownOvr}
          tier={view.tier}
          provisional={card.provisional && !view.newSeason}
          counted={card.gameweeksCounted}
          min={card.minRated}
          statsFilled={view.statsFilled}
          formingLabel={moments.m3.label}
          change={change.badge}
        />
      </CardStage>
      <p className={cn("px-4", ui.text.meta, ui.tone.muted)} data-testid="sample-acked">
        {acked.length > 0 ? `acknowledged: ${acked.join(", ")}` : "not acknowledged yet"}
      </p>
    </div>
  );
}
