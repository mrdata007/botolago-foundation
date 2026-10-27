import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { SectionHeader } from "@/components/common/SectionHeader";
import { clubLabel, findClub } from "@/components/fantasy/club-identity";
import { ui, UiBadge, UiCard, UiEmptyState, UiErrorState, UiSkeleton } from "@/components/ui-kit";
import type { Club } from "@/types/domain";
import type { FootballPlayerSeasonProfileDto } from "@/backend/fantasy/contracts";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";

import { clubScore, matchOutcome, partialCoverage, type MatchOutcome } from "./football-profile";

type LastMatch = FootballPlayerSeasonProfileDto["lastMatches"][number];

/**
 * The football side of the player page: this season's matches, starts,
 * minutes, goals, assists, cards and average rating, then the last five
 * matches with their score and rating, each one a link to its match page.
 *
 * Everything comes from `api.football_player_season_profile`. It is read by
 * this section alone: while it loads, fails or has nothing to show, the rest of
 * the page is untouched. It is a client-only query, like the gameweek history,
 * so the server and the browser's first render agree (see the route's loader).
 *
 * The figures only cover the finished matches the post-match pipeline has
 * written rows for. When that is fewer than the club has played, the section
 * says "Chiffres sur 4 des 5 matchs de son club" under the figures; a partial
 * season is never presented as the whole one. A missing rating is a dash or
 * "Sans note", never a zero.
 */
export function PlayerFootballProfile({
  playerId,
  clubs,
}: {
  playerId: string;
  clubs: readonly Club[];
}) {
  const { t } = useI18n();
  const profileQ = useQuery({
    queryKey: ["football-player-season-profile", playerId],
    queryFn: () => fantasyService.getPlayerSeasonProfile(playerId),
  });

  return (
    <section className="mt-6 px-4" data-testid="player-football-profile">
      <SectionHeader title={t("fantasy.football.title")} />
      {profileQ.isPending ? (
        <div role="status" aria-label={t("state.loading")} className="space-y-2">
          <UiSkeleton className={cn("h-36", ui.radius.card)} />
          <UiSkeleton className={cn("h-48", ui.radius.card)} />
        </div>
      ) : profileQ.isError ? (
        <UiErrorState onRetry={() => void profileQ.refetch()} />
      ) : (
        <Loaded profile={profileQ.data} clubs={clubs} />
      )}
    </section>
  );
}

function Loaded({
  profile,
  clubs,
}: {
  profile: FootballPlayerSeasonProfileDto;
  clubs: readonly Club[];
}) {
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const ratingNf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const { totals, lastMatches } = profile;
  const gap = partialCoverage(profile.coverage);

  const coverageNote = gap ? (
    <p className={cn("mt-2 px-1", ui.text.meta, ui.tone.muted)} data-testid="player-football-gap">
      {sentence(t("fantasy.football.coverage_note"), {
        covered: <bdi key="c">{nf.format(gap.covered)}</bdi>,
        finished: <bdi key="f">{nf.format(gap.finished)}</bdi>,
      })}
    </p>
  ) : null;

  if (totals.appearances === 0) {
    // With every finished match covered this is the plain "not yet" state. With
    // a gap it cannot claim the player has not played: the club's other matches
    // are simply not in the figures yet, so it says that instead.
    return (
      <>
        <UiEmptyState
          title={gap ? t("fantasy.football.empty_partial") : t("fantasy.football.empty")}
          body={gap ? t("fantasy.football.empty_partial_desc") : t("fantasy.football.empty_desc")}
        />
        {coverageNote}
      </>
    );
  }

  const average = totals.averageRating === null ? null : ratingNf.format(totals.averageRating);
  const none = t("fantasy.stat.none");

  return (
    <>
      <UiCard padding="none" className="overflow-hidden">
        <dl className="grid grid-cols-4">
          <Figure label={t("fantasy.football.appearances")} value={nf.format(totals.appearances)} />
          <Figure label={t("fantasy.football.starts")} value={nf.format(totals.starts)} divided />
          <Figure label={t("fantasy.football.minutes")} value={nf.format(totals.minutes)} divided />
          <Figure label={t("fantasy.football.rating_avg")} value={average ?? none} divided />
          <Figure label={t("fantasy.football.goals")} value={nf.format(totals.goals)} ruled />
          <Figure
            label={t("fantasy.football.assists")}
            value={nf.format(totals.assists)}
            divided
            ruled
          />
          <Figure
            label={t("fantasy.football.yellow")}
            value={nf.format(totals.yellowCards)}
            divided
            ruled
          />
          <Figure
            label={t("fantasy.football.red")}
            value={nf.format(totals.redCards)}
            divided
            ruled
          />
        </dl>
      </UiCard>
      {totals.ratedMatches > 0 && totals.ratedMatches < totals.appearances ? (
        <p className={cn("mt-2 px-1", ui.text.meta, ui.tone.muted)}>
          {sentence(t("fantasy.football.rated_note"), {
            n: <bdi key="n">{nf.format(totals.ratedMatches)}</bdi>,
            total: <bdi key="total">{nf.format(totals.appearances)}</bdi>,
          })}
        </p>
      ) : null}
      {totals.assistsMissing > 0 ? (
        <p className={cn("mt-2 px-1", ui.text.meta, ui.tone.muted)}>
          {sentence(t("fantasy.football.assists_missing"), {
            n: <bdi key="n">{nf.format(totals.assistsMissing)}</bdi>,
          })}
        </p>
      ) : null}
      {coverageNote}

      {lastMatches.length > 0 ? (
        <div className="mt-6">
          <SectionHeader title={t("fantasy.football.last")} />
          <UiCard padding="none" className="overflow-hidden">
            <ul className="divide-y divide-[color:var(--ui-rule)]">
              {lastMatches.map((match) => (
                <li key={match.fixtureId}>
                  <MatchRow
                    match={match}
                    club={findClub(clubs, match.opponent.teamId)}
                    locale={locale}
                    nf={nf}
                    ratingNf={ratingNf}
                  />
                </li>
              ))}
            </ul>
          </UiCard>
        </div>
      ) : null}
    </>
  );
}

/**
 * One figure over its label. Two rows of four, so the rule is logical: a start
 * edge on every cell but the first of a row, a top edge on the second row.
 */
function Figure({
  label,
  value,
  divided = false,
  ruled = false,
}: {
  label: string;
  value: string;
  divided?: boolean;
  ruled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col-reverse items-center justify-end gap-0.5 px-1 py-3 text-center",
        divided && ui.rule.inline,
        ruled && ui.rule.blockStart,
      )}
    >
      <dt
        className={cn(
          "max-w-full text-balance [overflow-wrap:anywhere]",
          ui.text.meta,
          ui.tone.muted,
        )}
      >
        {label}
      </dt>
      <dd className={cn("max-w-full", ui.stat.md, ui.tone.default)}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}

const OUTCOME_TONE = { win: "positive", draw: "neutral", loss: "negative" } as const;

/** The letter on the chip and the word read out for it, as literal keys. */
function outcomeText(outcome: MatchOutcome, t: (key: TranslationKey) => string) {
  return outcome === "win"
    ? { letter: t("fantasy.football.win"), word: t("fantasy.football.win_label") }
    : outcome === "draw"
      ? { letter: t("fantasy.football.draw"), word: t("fantasy.football.draw_label") }
      : { letter: t("fantasy.football.loss"), word: t("fantasy.football.loss_label") };
}

function MatchRow({
  match,
  club,
  locale,
  nf,
  ratingNf,
}: {
  match: LastMatch;
  club: Club | undefined;
  locale: string;
  nf: Intl.NumberFormat;
  ratingNf: Intl.NumberFormat;
}) {
  const { t, tr } = useI18n();
  const opponent = club ? clubLabel(club, tr) : match.opponent.shortName;
  const venue = match.home ? t("fantasy.players.home") : t("fantasy.players.away");
  const score = clubScore(match);
  const outcome = matchOutcome(match);
  const date = moroccoDateTimeFormat(locale, { day: "numeric", month: "short" }).format(
    new Date(match.kickoffAt),
  );
  const rating = match.rating === null ? null : ratingNf.format(match.rating);
  const scoreText = score ? `${nf.format(score.own)} – ${nf.format(score.other)}` : null;
  // The accessible name carries what the colours and the layout say: the
  // result, the opponent, the ground, the score and the rating.
  const label = [
    outcome ? outcomeText(outcome, t).word : null,
    opponent,
    venue,
    scoreText,
    rating ? `${t("fantasy.football.rating")} ${rating}` : t("fantasy.football.unrated"),
  ]
    .filter(Boolean)
    .join(", ");

  const details: ReactNode[] = [
    <bdi key="date">{date}</bdi>,
    venue,
    t("fantasy.football.min").replace("{n}", nf.format(match.minutes)),
  ];
  if (match.goals > 0) {
    details.push(
      sentence(t("fantasy.football.goals_line"), {
        n: <bdi key="g">{nf.format(match.goals)}</bdi>,
      }),
    );
  }
  if (match.assists !== null && match.assists > 0) {
    details.push(
      sentence(t("fantasy.football.assists_line"), {
        n: <bdi key="a">{nf.format(match.assists)}</bdi>,
      }),
    );
  }

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.fixtureId }}
      aria-label={label}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        ui.space.tap,
        ui.focus,
        "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
        "hover:bg-[color:var(--ui-surface-sunken)]",
      )}
    >
      {outcome ? (
        <UiBadge tone={OUTCOME_TONE[outcome]} className="size-7 shrink-0 p-0">
          <span aria-hidden>{outcomeText(outcome, t).letter}</span>
        </UiBadge>
      ) : (
        <span aria-hidden className="size-7 shrink-0" />
      )}
      {club ? <ClubCrest club={club} size="sm" /> : null}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate", ui.text.bodyStrong, ui.tone.default)}>{opponent}</p>
        <p className={cn(ui.text.meta, ui.tone.muted)}>
          {details.map((item, index) => (
            // Each item stays whole, so a long line breaks between items and not
            // inside "71 min" or "Buts : 2". The space between them sits outside
            // the nowrap span: that is where the line may break.
            <Fragment key={index}>
              <span className="whitespace-nowrap">
                {item}
                {index < details.length - 1 ? " ·" : null}
              </span>{" "}
            </Fragment>
          ))}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {scoreText ? (
          <span className={cn(ui.stat.sm, ui.tone.default)}>
            <bdi dir="ltr">{scoreText}</bdi>
          </span>
        ) : null}
        <span
          className={cn(
            "rounded-full px-2 py-0.5",
            ui.surface.sunken,
            rating ? cn(ui.stat.sm, ui.tone.default) : cn(ui.text.meta, ui.tone.muted),
          )}
        >
          {rating ? <bdi>{rating}</bdi> : t("fantasy.football.unrated")}
        </span>
      </div>
    </Link>
  );
}

/**
 * Fill `{name}` slots of a translated sentence with elements, so a figure can
 * sit in its own `<bdi>` and keep its order inside Arabic text.
 */
function sentence(template: string, slots: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/(\{[a-z]+\})/);
  return parts.map((part, index) => {
    const name = /^\{([a-z]+)\}$/.exec(part)?.[1];
    return name && name in slots ? <span key={index}>{slots[name]}</span> : part;
  });
}
