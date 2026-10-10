import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";

import { FailureAwareImage } from "@/components/common/FailureAwareImage";
import { useI18n } from "@/i18n/provider";
import { clubInitials } from "@/lib/club-identity";
import { responsiveMedia } from "@/lib/media";
import { fixtureDifficultyQuery } from "@/services/fantasy-queries";
import type { Club } from "@/types/domain";
import type { FixtureDifficulty } from "@/types/fantasy";

/**
 * Next-fixture plates per club for the given gameweek.
 *
 * BG-0111 — this used to build the plate as `${crestPlaceholder} (D)` and
 * `crestPlaceholder` resolved to an empty string, so every plate on the pitch
 * read a bare "(D)" or "(E)": a home/away marker with nothing to be home or
 * away against. Two independent causes, both fixed here:
 *
 *   - the opponent club was looked up by id alone. Fantasy fixture rows and
 *     the football club list agree on that id in cloud mode only; in mock the
 *     football repository mints synthetic UUIDs while the Fantasy fixtures key
 *     on the source slug, so the lookup found nothing at all. It now matches
 *     on id OR slug.
 *   - `app.clubs.code` is blank for most of the league on production, so even
 *     a resolved club had no letters to show. `presentFootballClub` now
 *     derives the placeholder from `short_name` (see `@/lib/club-identity`).
 *
 * What a plate renders, in order of preference:
 *
 *   1. the opponent's crest (14px) next to its short code and the home/away
 *      marker — the crest is the identity signal the owner asked for, the
 *      letters are what stays legible at plate size;
 *   2. short code + marker alone, when the club has no crest;
 *   3. nothing at all, when the opponent cannot be resolved. The caller falls
 *      back to the player's price, which says something; "(D)" does not.
 */
export function useNextFixtures(clubs: Club[], gameweek: number | null, enabled = true) {
  const { t, tr } = useI18n();
  const query = useQuery({
    ...fixtureDifficultyQuery(),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const { labels, texts } = useMemo(() => {
    const labels = new Map<string, ReactNode>();
    const texts = new Map<string, string>();
    if (!query.data || gameweek === null) return { labels, texts };

    const clubFor = (id: string) => clubs.find((club) => club.id === id || club.slug === id);

    const parts = new Map<string, { node: ReactNode; text: string }[]>();
    for (const row of query.data as FixtureDifficulty[]) {
      if (row.gameweek !== gameweek) continue;
      const opponent = clubFor(row.opponentClubId);
      if (!opponent) continue;

      const code = opponent.crestPlaceholder.trim() || clubInitials(tr(opponent.shortName));
      if (!code) continue;

      const marker = row.isHome ? t("fpl.home_short") : t("fpl.away_short");
      const text = `${code} (${marker})`;
      // The chip is the fixture's difficulty colour (`--ui-fdr-N`, with its own
      // readable foreground), so a manager reads "easy" or "hard" at a glance.
      const node = (
        <span
          key={`${row.opponentClubId}-${row.isHome ? "h" : "a"}`}
          // Never wider than the plate's figure band (a narrow plate cut its
          // end off and left the band's ellipsis as a stray dot). The plate
          // is a size container: below 80px the crest drops (the badge with
          // it needs ~73px, the band of a 76px plate holds 68), below 68px
          // the padding tightens, and only then is the code cut with "…".
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full px-1.5 align-middle @max-[68px]:px-1"
          style={{
            backgroundColor: `var(--ui-fdr-${row.difficulty})`,
            color: `var(--ui-on-fdr-${row.difficulty})`,
          }}
          title={`${tr(opponent.name)} (${marker})`}
        >
          {opponent.crestUrl ? (
            <FailureAwareImage
              {...responsiveMedia(opponent.crestUrl, { kind: "crest", sizes: "14px" })}
              alt=""
              aria-hidden
              draggable={false}
              className="h-3.5 w-3.5 shrink-0 object-contain @max-[80px]:hidden"
            />
          ) : null}
          <span className="min-w-0 truncate">{text}</span>
        </span>
      );

      const list = parts.get(row.clubId) ?? [];
      list.push({ node, text });
      parts.set(row.clubId, list);
    }

    for (const [clubId, list] of parts) {
      texts.set(clubId, list.map((part) => part.text).join(" · "));
      labels.set(
        clubId,
        list.length === 1 ? (
          list[0]!.node
        ) : (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1">
            {list.map((part, index) => (
              <span key={index} className="inline-flex min-w-0 items-center gap-1">
                {index > 0 ? (
                  <span aria-hidden className="shrink-0">
                    ·
                  </span>
                ) : null}
                {part.node}
              </span>
            ))}
          </span>
        ),
      );
    }

    return { labels, texts };
  }, [query.data, clubs, gameweek, t, tr]);

  // Clubs with a match in the gameweek; null when the gameweek's fixtures are not known.
  const playingClubIds = useMemo(() => {
    if (!query.data || gameweek === null) return null;
    const inRound = (query.data as FixtureDifficulty[]).filter((row) => row.gameweek === gameweek);
    if (inRound.length === 0) return null;
    return new Set(inRound.filter((row) => !row.isBlank).map((row) => row.clubId));
  }, [query.data, gameweek]);

  return {
    /** Clubs that play in the gameweek, or null when its fixtures are not known. */
    playingClubIds,
    /** clubId -> the rendered plate content (crest + code + marker). */
    labels,
    /** clubId -> the same plate as plain text, for titles and assertions. */
    texts,
    rows: (query.data ?? []) as FixtureDifficulty[],
    isPending: query.isPending,
    isError: query.isError,
  };
}
