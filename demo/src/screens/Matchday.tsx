/**
 * The one screen the product does not have: the moment between "team
 * confirmed" and "points in". In the live game that is a weekend of real
 * matches; here the presenter plays Journée 12 with one tap, and the eight
 * results come in on the product's own match cards.
 */
import fantasyHeroPhoto from "@/assets/photos/fantasy-hero.webp";
import { useNavigate } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MatchCard } from "@/components/common/MatchCard";
import { rankOrdinal } from "@/components/fantasy-lists/rank-ordinal";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FplPitch } from "@/components/fpl/FplPitch";
import { FplPlayerCard } from "@/components/fpl/FplPlayerCard";
import { ui, UiButton, UiCard, UiHeader } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/domain";
import type { Position } from "@/types/fantasy";

import { SponsorLogo, useSponsorName } from "../components/Sponsor";
import { FixturePlate } from "../components/FixturePlate";
import { useDemoCopy } from "../copy";
import { BOARD_SIZE, gameweekBoard } from "../data/board";
import { DEMO_GAMEWEEK, clubById, playerById, roundMatches } from "../data/world";
import { positionsFor, scoreTeam, useDemo } from "../state";
import { useDemoUi } from "../ui-state";
import { FALLBACK_TEAM_NAME, useMyEntry } from "./shared";

const ROWS: Position[] = ["GK", "DEF", "MID", "FWD"];

export function MatchdayScreen() {
  const { state } = useDemo();
  const navigate = useNavigate();
  useEffect(() => {
    if (!state.saved) void navigate({ to: "/fantasy/create", replace: true });
  }, [state.saved, navigate]);
  if (!state.saved) return null;
  return <FantasyFrame bottomNav>{state.played ? <Results /> : <Kickoff />}</FantasyFrame>;
}

function Hero({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden">
      <img
        src={fantasyHeroPhoto}
        alt=""
        aria-hidden
        decoding="async"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_55%]"
      />
      <span
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 70%, transparent), color-mix(in oklab, var(--ui-ink-deep) 94%, transparent))",
        }}
      />
      <div className={cn("py-6", ui.space.gutter, ui.tone.onInkPlain)}>{children}</div>
    </section>
  );
}

function PresentedBy() {
  const { state } = useDemo();
  const copy = useDemoCopy();
  const name = useSponsorName(state.sponsor);
  const { highlightSponsor } = useDemoUi();
  return (
    <p
      data-sponsor-slot="matchday"
      className={cn("mt-4 flex items-center gap-2", highlightSponsor && "demo-sponsor-highlight")}
    >
      <span className={cn(ui.text.label, ui.tone.onInkMuted)}>{copy("presentedBy")}</span>
      <SponsorLogo sponsor={state.sponsor} name={name} size={24} />
      <span className={cn(ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>{name}</span>
    </p>
  );
}

function Kickoff() {
  const { t } = useI18n();
  const copy = useDemoCopy();
  const { state, actions } = useDemo();
  const positions = positionsFor(state.formation);
  const rows = ROWS.map((position) =>
    state.picks
      .map((id, index) => ({ id, position: positions[index] }))
      .filter((slot) => slot.position === position && slot.id)
      .map((slot) => {
        const player = playerById(slot.id)!;
        return (
          <FplPlayerCard
            key={player.id}
            player={player}
            club={clubById(player.clubId)}
            sub={<FixturePlate player={player} />}
            captain={player.id === state.captainId}
            vice={player.id === state.viceId}
          />
        );
      }),
  );

  return (
    <>
      <UiHeader
        kicker={t("fantasy.title")}
        title={state.teamName.trim() || FALLBACK_TEAM_NAME}
        backTo="/fantasy"
      />
      <Hero>
        <p className={cn(ui.text.label, ui.tone.onInkMuted)}>
          {copy("kickoffKicker", { n: DEMO_GAMEWEEK })}
        </p>
        <h2 className={cn("mt-1 uppercase", ui.display.hero)}>{copy("kickoffTitle")}</h2>
        <p className={cn("mt-2 max-w-[34ch]", ui.text.secondary, ui.tone.onInkMuted)}>
          {copy("kickoffBody")}
        </p>
        <PresentedBy />
      </Hero>

      <FplPitch className="mx-[var(--ui-gutter)] mt-4" rows={rows} />

      <div
        className={cn(
          "sticky bottom-[var(--bottomnav-h)] z-30 mt-4 md:bottom-0",
          ui.surface.bar,
          ui.rule.blockStart,
          ui.shadow.raised,
          "pb-2.5 pt-2.5",
        )}
      >
        <div className={ui.space.gutter}>
          <UiButton variant="gradient" onClick={actions.play}>
            <Play className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            {copy("playGameweek")}
          </UiButton>
        </div>
      </div>
    </>
  );
}

/** Counts up to `target` once, unless the visitor prefers less motion. */
function useCountUp(target: number, durationMs = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

function Results() {
  const { t, lang } = useI18n();
  const copy = useDemoCopy();
  const navigate = useNavigate();
  const { state } = useDemo();
  const me = useMyEntry();
  const total = scoreTeam(state).total;
  const shown = useCountUp(total);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const myRank = useMemo(
    () =>
      me ? (gameweekBoard(true, me).find((row) => row.managerId === "me")?.rank ?? null) : null,
    [me],
  );
  const ordinal = myRank ? rankOrdinal(myRank, lang, t, (value) => nf.format(value)) : null;

  const matches: Match[] = roundMatches(DEMO_GAMEWEEK).map((match) => ({
    id: match.id,
    gameweek: match.round,
    homeClubId: match.homeClubId,
    awayClubId: match.awayClubId,
    kickoff: match.kickoff,
    status: "finished",
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    venue: { fr: "", ar: "" },
  }));

  return (
    <>
      <UiHeader
        kicker={t("fantasy.title")}
        title={state.teamName.trim() || FALLBACK_TEAM_NAME}
        backTo="/fantasy"
      />
      <Hero>
        <p className={cn(ui.text.label, ui.tone.onInkMuted)}>
          {copy("kickoffKicker", { n: DEMO_GAMEWEEK })} · {t("fantasy.points.status.final")}
        </p>
        <p className={cn("mt-3", ui.text.label, ui.tone.onInkMuted)}>{copy("yourScore")}</p>
        <p className="flex items-baseline gap-2" aria-live="polite">
          <bdi className={ui.score.hero}>{nf.format(shown)}</bdi>
          <span className={cn(ui.text.bodyStrong, ui.tone.onInkMuted)}>
            {t("fantasy.points.abbr")}
          </span>
        </p>
        {ordinal ? (
          <p className={cn("mt-1", ui.text.secondary, ui.tone.onInkMuted)}>
            <strong className={ui.tone.onInkPlain}>
              {ordinal.before ? `${ordinal.before} ` : null}
              <bdi>{ordinal.figure}</bdi>
              {ordinal.after}
            </strong>{" "}
            {copy("gameweekRankOf", { total: nf.format(BOARD_SIZE + 1) })}
          </p>
        ) : null}
        <PresentedBy />
      </Hero>

      <section className={cn("mt-5", ui.space.gutter)} aria-labelledby="results-heading">
        <h2 id="results-heading" className={cn("pb-2.5", ui.display.section, ui.tone.default)}>
          {copy("resultsTitle")}
        </h2>
        <UiCard padding="none" className="overflow-hidden">
          <ul>
            {matches.map((match, index) => {
              const home = clubById(match.homeClubId)!;
              const away = clubById(match.awayClubId)!;
              return (
                <li
                  key={match.id}
                  className={cn(
                    index < matches.length - 1 && ui.rule.block,
                    "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both",
                  )}
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <MatchCard match={match} home={home} away={away} variant="list" />
                </li>
              );
            })}
          </ul>
        </UiCard>
      </section>

      <div
        className={cn(
          "sticky bottom-[var(--bottomnav-h)] z-30 mt-4 md:bottom-0",
          ui.surface.bar,
          ui.rule.blockStart,
          ui.shadow.raised,
          "pb-2.5 pt-2.5",
        )}
      >
        <div className={cn("grid grid-cols-2 gap-2", ui.space.gutter)}>
          <UiButton
            variant="gradient"
            className="px-2"
            onClick={() => void navigate({ to: "/fantasy/points" })}
          >
            {copy("seePoints")}
          </UiButton>
          <UiButton
            variant="ink"
            className="px-2"
            onClick={() => void navigate({ to: "/fantasy/rankings" })}
          >
            {copy("seeRanking")}
          </UiButton>
        </div>
      </div>
    </>
  );
}
