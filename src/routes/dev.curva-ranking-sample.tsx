import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { RankingView, type RankingStatus } from "@/components/curva-ranking/RankingView";
import { RANKING_LIMIT, buildRanking } from "@/components/curva-ranking/ranking";
import { SAMPLE_CARDS, SAMPLE_OWN_ID } from "@/components/curva-ranking/sample-data";
import { useRankingCopy } from "@/components/curva-ranking/ranking-copy";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { UiHeader } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";

/**
 * A SAMPLE of the Curva ranking, for browser tests and for looking at it. Development servers
 * only: anywhere else this route is "not found", so it is never a page a visitor or a crawler can
 * reach. Everything on it is invented; no database, no network, no Supabase client.
 */
type Search = {
  lang?: "fr" | "ar";
  /** `all`: the « Tous » view. */
  scope?: "all";
  state?: "loading" | "error" | "off" | "empty" | "no_league";
};

export const Route = createFileRoute("/dev/curva-ranking-sample")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.lang === "ar" || search.lang === "fr" ? { lang: search.lang } : {}),
    ...(search.scope === "all" ? { scope: "all" as const } : {}),
    ...(search.state === "loading" ||
    search.state === "error" ||
    search.state === "off" ||
    search.state === "empty" ||
    search.state === "no_league"
      ? { state: search.state }
      : {}),
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: SampleHarness,
});

const LEAGUES = [
  { id: "00000000-0000-4000-8000-000000000301", name: "Les Aigles du quartier" },
  { id: "00000000-0000-4000-8000-000000000302", name: "Bureau 2026" },
];

function SampleHarness() {
  const search = Route.useSearch();
  const lang = search.lang ?? "fr";
  const { setLanguage } = useI18n();
  const copy = useRankingCopy();
  useEffect(() => setLanguage(lang), [lang, setLanguage]);

  const ranking = useMemo(
    () => buildRanking(search.state === "empty" ? [] : SAMPLE_CARDS, SAMPLE_OWN_ID),
    [search.state],
  );
  const status: RankingStatus =
    search.state === "loading" ||
    search.state === "error" ||
    search.state === "off" ||
    search.state === "no_league"
      ? search.state
      : "ready";

  return (
    <FantasyFrame bottomNav>
      <p className="px-4 pt-2 text-xs opacity-70" data-testid="sample-harness">
        SAMPLE DATA · not production
      </p>
      <UiHeader title={copy.title} backTo="/curva" />
      <RankingView
        scope={search.scope ?? "league"}
        onScope={() => {}}
        leagues={LEAGUES}
        leagueId={LEAGUES[0]!.id}
        onLeague={() => {}}
        ranking={ranking}
        status={status}
        limit={RANKING_LIMIT}
        onRetry={() => {}}
      />
    </FantasyFrame>
  );
}
