import type { ReactNode } from "react";

import type { CardClubDto } from "@/backend/manager-card/contracts";
import { ClubCrest } from "@/components/common/ClubCrest";
import { MatchCard } from "@/components/common/MatchCard";
import { SectionHeader } from "@/components/common/SectionHeader";
import { MatchCardSkeleton } from "@/components/common/Skeletons";
import { useCardCopy, useGradinsCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { ui, UiCard, UiLinkButton } from "@/components/ui-kit";
import type { ClubSpotlight } from "@/components/home/my-clubs";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import type { Club, Match } from "@/types/domain";

import { CAPTION_CLASS, PersonName } from "./figures";

/**
 * « Votre club »: the club the card is dressed in, and its city, the people of your leagues who
 * support it too, and its next match (plan 4.1 and 4.5). There is no club page and no club
 * league: there is no honest data for either, and counts of supporters are banned. What is true
 * is shown: the club, the people you actually play with, the match.
 *
 * The header is the app's own club header (the Home « Mes clubs » card): the club's colours come
 * from the club palette as a tint and a 4px start edge, the crest is the disc. A card with no
 * club says so and offers the profile, where the club is chosen.
 */
export function ClubBlock({
  dto,
  club,
  mates,
  spotlight,
  spotlightFailed,
  retry,
  clubById,
}: {
  dto: CardClubDto | null;
  club: Club | null;
  /** Players of the reader's league who support the same club (names), and that league's name. */
  mates: { league: string; names: readonly string[] } | null;
  /** Undefined while the club's matches load. */
  spotlight: ClubSpotlight | undefined;
  spotlightFailed: boolean;
  retry: () => void;
  clubById: (id: string) => Club | undefined;
}) {
  const copy = useGradinsCopy();
  const card = useCardCopy();
  const { t, lang } = useI18n();

  if (!dto || !club) {
    return (
      <section data-testid="gradins-club" aria-label={copy.clubTitle}>
        <SectionHeader title={copy.clubTitle} />
        <UiCard padding="md" className="flex flex-col items-start gap-3">
          <p className={cn("text-pretty", ui.text.secondary, ui.tone.muted)}>{copy.clubNone}</p>
          <UiLinkButton to="/profile" variant="soft" size="sm">
            {copy.clubChoose}
          </UiLinkButton>
        </UiCard>
      </section>
    );
  }

  const colours = clubStyle(club);
  const city = dto.city ? dto.city[lang] || dto.city.fr : "";
  const clubName = dto.shortName[lang] || dto.shortName.fr || dto.name[lang] || dto.name.fr;
  const fullName = dto.name[lang] || dto.name.fr;
  const matesText: ReactNode =
    mates && mates.names.length > 0
      ? fill(mates.names.length === 1 ? copy.clubMatesOne : copy.clubMatesOther, {
          league: <PersonName>{mates.league}</PersonName>,
          club: <PersonName>{clubName}</PersonName>,
          names: mates.names.map((name, index) => (
            <span key={`${name}-${index}`}>
              {index > 0 ? card.a11y.separator : ""}
              <PersonName>{name}</PersonName>
            </span>
          )),
        })
      : null;

  return (
    <section data-testid="gradins-club" aria-label={copy.clubTitle}>
      <SectionHeader title={copy.clubTitle} />
      <UiCard padding="none" className="overflow-hidden">
        <div
          data-club={colours["data-club"]}
          style={colours.style}
          className={cn(
            "flex min-h-[var(--ui-row-min)] items-center gap-3 px-4 py-3",
            ui.club.tint,
            ui.edge.start,
          )}
        >
          <ClubCrest club={club} size="md" />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate", ui.display.team, ui.tone.default)}>
              <PersonName>{fullName}</PersonName>
            </p>
            {city ? (
              <p className={cn("truncate", ui.text.meta, ui.tone.muted)}>
                <PersonName>{city}</PersonName>
              </p>
            ) : null}
          </div>
        </div>
        {matesText ? (
          <p
            className={cn(
              "px-4 py-3 text-pretty",
              ui.rule.blockStart,
              ui.text.secondary,
              ui.tone.default,
            )}
            data-testid="gradins-club-mates"
          >
            {matesText}
          </p>
        ) : null}
        <div className={ui.rule.blockStart}>
          {spotlightFailed ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className={cn(ui.text.secondary, ui.tone.muted)}>{t("state.error")}</span>
              <button
                type="button"
                onClick={retry}
                className={cn(
                  "min-h-[var(--ui-tap-min)] px-2",
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.tone.ink,
                  ui.focus,
                )}
              >
                {t("state.retry")}
              </button>
            </div>
          ) : !spotlight ? (
            <MatchCardSkeleton flat />
          ) : spotlight.kind === "none" ? null : (
            <>
              <p className={cn("px-4 pt-3", CAPTION_CLASS)}>
                {spotlight.kind === "result" ? t("home.my_clubs.last_result") : copy.clubNextMatch}
              </p>
              <SpotlightMatch match={spotlight.match} clubById={clubById} />
            </>
          )}
        </div>
      </UiCard>
    </section>
  );
}

function SpotlightMatch({
  match,
  clubById,
}: {
  match: Match;
  clubById: (id: string) => Club | undefined;
}) {
  const home = clubById(match.homeClubId);
  const away = clubById(match.awayClubId);
  if (!home || !away) return <MatchCardSkeleton flat />;
  return <MatchCard match={match} home={home} away={away} variant="list" />;
}
