/**
 * The welcome screen, the prize page, the match calendar, and a quiet
 * landing for the sections the demo does not cover.
 */
import emptyNewsArt from "@/assets/illustrations/empty-news.webp";
import helpHeroArt from "@/assets/illustrations/help-hero.webp";
import rulesHeroArt from "@/assets/illustrations/rules-hero.webp";
import standingsSoonArt from "@/assets/illustrations/standings-soon.webp";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { MatchCard } from "@/components/common/MatchCard";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { MatchesTabs } from "@/components/matches/MatchesTabs";
import { PrizesPage } from "@/components/prizes/PrizesPage";
import { AppShell } from "@/components/shell/AppShell";
import { ui, UiCard, UiEmptyState, UiHeader, UiLinkButton, UiPageTitle } from "@/components/ui-kit";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/domain";

import { SponsorBanner, sponsorLogoUrl, useSponsorName } from "../components/Sponsor";
import { useDemoCopy } from "../copy";
import { DEMO_GAMEWEEK, clubById, roundMatches } from "../data/world";
import { setPrizeSponsor } from "../prizes";
import { useDemo } from "../state";

export function WelcomeRoute() {
  const navigate = useNavigate();
  const go = () => void navigate({ to: "/fantasy" });
  return <WelcomeScreen onGuest={go} onSignIn={go} />;
}

/** `/prizes`: the product's prize page, every lot offered by the partner. */
export function PrizesScreen() {
  const { t } = useI18n();
  const copy = useDemoCopy();
  const queryClient = useQueryClient();
  const { state } = useDemo();
  const name = useSponsorName(state.sponsor);
  const logo = sponsorLogoUrl(state.sponsor, name);
  // Set before the page asks for the catalog, and again whenever it changes.
  setPrizeSponsor(name, logo);
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["prizes", "catalog"] });
  }, [name, logo, queryClient]);

  return (
    <FantasyFrame bottomNav>
      <UiHeader kicker={t("nav.fantasy")} title={t("prizes.title")} backTo="/fantasy" />
      <div className={cn("pt-4", ui.space.gutter)}>
        <SponsorBanner title={copy("prizesOfferedBy")} pitch />
      </div>
      <PrizesPage />
    </FantasyFrame>
  );
}

function toMatch(match: ReturnType<typeof roundMatches>[number], played: boolean): Match {
  return {
    id: match.id,
    gameweek: match.round,
    homeClubId: match.homeClubId,
    awayClubId: match.awayClubId,
    kickoff: match.kickoff,
    status: played ? "finished" : "scheduled",
    homeScore: played ? match.homeScore : undefined,
    awayScore: played ? match.awayScore : undefined,
    venue: { fr: "", ar: "" },
  };
}

/** `/matches`: Journée 12 (fixtures, or results once played) and Journée 11. */
export function CalendarScreen() {
  const { t } = useI18n();
  const { state } = useDemo();
  const rounds = [
    { round: DEMO_GAMEWEEK, played: state.played },
    { round: DEMO_GAMEWEEK - 1, played: true },
  ];
  return (
    <AppShell
      backgroundVariant="matches"
      pageHeader={
        <>
          <UiPageTitle title={t("matches.title")} className="border-b-0" />
          <MatchesTabs active="calendar" />
        </>
      }
    >
      <div className="grid min-w-0 gap-6">
        {rounds.map(({ round, played }) => (
          <section key={round} aria-labelledby={`round-${round}`} className="grid gap-2.5">
            <h2 id={`round-${round}`} className={cn(ui.display.section, ui.tone.default)}>
              {`${t("fpl.gameweek")} ${round}`}
            </h2>
            <UiCard padding="none" className="overflow-hidden">
              <ul>
                {roundMatches(round).map((match, index, list) => (
                  <li key={match.id} className={cn(index < list.length - 1 && ui.rule.block)}>
                    <MatchCard
                      match={toMatch(match, played)}
                      home={clubById(match.homeClubId)!}
                      away={clubById(match.awayClubId)!}
                      variant="list"
                    />
                  </li>
                ))}
              </ul>
            </UiCard>
          </section>
        ))}
      </div>
      <div className="h-6" aria-hidden />
    </AppShell>
  );
}

const ELSEWHERE = [
  { prefix: "/news", title: "nav.news", art: emptyNewsArt },
  { prefix: "/profile", title: "nav.profile", art: helpHeroArt },
  { prefix: "/clubs", title: "club.all_clubs", art: standingsSoonArt },
  { prefix: "/pronostics", title: "nav.matches", art: standingsSoonArt },
] as const;

/** Any section outside the pitch: said plainly, with the way back. */
export function ElsewhereScreen() {
  const { t } = useI18n();
  const copy = useDemoCopy();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const match = ELSEWHERE.find((entry) => path.startsWith(entry.prefix));
  return (
    <FantasyFrame bottomNav topBar="always">
      <UiPageTitle title={t(match?.title ?? "nav.fantasy")} />
      <div className={cn("pt-6", ui.space.gutter)}>
        <UiEmptyState
          illustration={match?.art ?? rulesHeroArt}
          title={copy("elsewhereTitle")}
          body={copy("elsewhereBody")}
        />
        <UiLinkButton to="/fantasy" variant="gradient" className="mt-4">
          {copy("backToFantasy")}
        </UiLinkButton>
      </div>
    </FantasyFrame>
  );
}
