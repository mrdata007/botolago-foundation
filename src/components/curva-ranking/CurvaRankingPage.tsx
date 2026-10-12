import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, type JSX } from "react";

import { CurvaError, CurvaLoading, CurvaUnavailable } from "@/components/curva/StateBlocks";
import { useCurvaScreen } from "@/components/curva/use-curva-screen";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { rememberLeague } from "@/components/manager-card/storage";
import { UiHeader } from "@/components/ui-kit";

import { RANKING_LIMIT } from "./ranking";
import { useRankingCopy } from "./ranking-copy";
import { RankingView, type RankingStatus } from "./RankingView";
import { useCurvaRanking } from "./use-curva-ranking";

/**
 * `/curva/classement?vue=ligue|tous&ligue=<id>`: the managers ranked by their card's overall
 * rating. A guest or an account with no team has no ranking to look at and goes back to Curva.
 */
export function CurvaRankingPage(): JSX.Element {
  const g = useCurvaScreen();
  const navigate = useNavigate();
  const copy = useRankingCopy();
  const { state } = g;
  const away = state.kind === "guest" || state.kind === "no_team";
  useEffect(() => {
    if (away) void navigate({ to: "/curva", replace: true });
  }, [away, navigate]);
  return (
    <FantasyFrame bottomNav>
      <UiHeader title={copy.title} backTo="/curva" />
      {state.kind === "loading" || away ? <CurvaLoading /> : null}
      {state.kind === "error" ? <CurvaError retry={g.retry} /> : null}
      {state.kind === "unavailable" ? <CurvaUnavailable /> : null}
      {state.kind === "card" ? <RankingBody /> : null}
    </FantasyFrame>
  );
}

function RankingBody(): JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/curva/classement" });
  const scope = search.vue === "tous" ? "all" : "league";
  const data = useCurvaRanking(true, scope, search.ligue);

  const status: RankingStatus = data.off
    ? "off"
    : data.listError
      ? "error"
      : data.noLeague
        ? "no_league"
        : data.leaguesPending || data.listPending || data.cardsPending
          ? "loading"
          : "ready";

  return (
    <RankingView
      scope={scope}
      onScope={(next) =>
        void navigate({
          to: "/curva/classement",
          search: (previous) => ({ ...previous, vue: next === "all" ? "tous" : undefined }),
          replace: true,
        })
      }
      leagues={data.leagues}
      leagueId={data.league?.id ?? null}
      onLeague={(id) => {
        rememberLeague(id);
        void navigate({
          to: "/curva/classement",
          search: (previous) => ({ ...previous, ligue: id }),
          replace: true,
        });
      }}
      ranking={data.ranking}
      status={status}
      cardsError={data.cardsError}
      limit={RANKING_LIMIT}
      onRetry={data.retry}
    />
  );
}
