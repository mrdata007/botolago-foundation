import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { matchDayQuery } from "@/components/matches/match-day-query";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { matchDayKey } from "@/lib/match-kickoff";
import { presentScore, scoreSentence } from "@/lib/match-score";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/domain";

/**
 * Today's matches in one scrollable row under the top bar, on desktop only
 * (1024px and up): score once a match has started, kick-off time before it.
 * It reads the same query as the Matches page, so the two never disagree.
 * A postponed match has no day to show, so it is left out.
 */
export function MatchdayStrip() {
  const { t, tr, lang } = useI18n();
  const today = matchDayKey(new Date());
  const dayQ = useQuery(matchDayQuery(today, lang, undefined));

  const matches = (dayQ.data?.matches ?? [])
    .filter((match) => match.status !== "postponed")
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  if (matches.length === 0) return null;

  const clubs = dayQ.data?.clubs ?? [];
  const code = (id: string) => clubs.find((club) => club.id === id)?.crestPlaceholder ?? "";
  const timeFmt = moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const middle = (match: Match) =>
    match.status === "scheduled"
      ? timeFmt.format(new Date(match.kickoff))
      : presentScore(match).text;

  // The link's name for a match that has started: the score as the other
  // surfaces announce it (an unknown one is "unavailable", not dashes read
  // out). A match still to play keeps its visible kick-off time.
  const nameOf = (id: string) => {
    const club = clubs.find((candidate) => candidate.id === id);
    return club ? tr(club.shortName) : "";
  };
  const linkLabel = (match: Match) =>
    match.status === "scheduled"
      ? undefined
      : scoreSentence(
          presentScore(match),
          { home: nameOf(match.homeClubId), away: nameOf(match.awayClubId) },
          t("matches.a11y.score"),
          t("matches.a11y.score_unavailable"),
        );

  return (
    <section
      aria-label={t("matches.matchday_strip")}
      data-app-strip
      className={cn("hidden lg:block", ui.surface.bar, ui.rule.block)}
    >
      <ul
        className={cn(
          "mx-auto flex max-w-[var(--ui-desktop-max)] items-center gap-2 overflow-x-auto py-2",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          ui.space.gutter,
        )}
      >
        {matches.map((match) => (
          <li key={match.id} className="shrink-0">
            <Link
              to="/matches/$matchId"
              params={{ matchId: match.id }}
              aria-label={linkLabel(match)}
              className={cn(
                "inline-flex min-h-[var(--ui-tap-min)] items-center gap-2 px-4",
                ui.radius.full,
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
                // The live match is the strip's current one: the selected
                // fill, which stays visible on the dark bar (BG-0149).
                match.status === "live"
                  ? ui.surface.selected
                  : "bg-[color:var(--ui-surface-sunken)] text-[color:var(--ui-on-surface)]",
                ui.focus,
              )}
            >
              <span>{code(match.homeClubId)}</span>
              <bdi className={ui.text.tabular}>{middle(match)}</bdi>
              <span>{code(match.awayClubId)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
