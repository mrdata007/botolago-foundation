import { ClubCrest, type ClubCrestSize } from "@/components/common/ClubCrest";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubMatchPalettes, clubPalette, clubStyle, type ClubPalette } from "@/lib/club-palette";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { ArticleFixture } from "./news-fixtures";

/**
 * The picture of a News story that has none of its own, drawn from data in the
 * match page's language (`MatchScoreHeader`): club-colour halves, crest discs,
 * and the score or the kick-off time on the seam.
 *
 *   - two clubs: the split. The first club is the first half, so Arabic puts
 *     it at the right with no extra rule. When the story is tied to a fixture
 *     (`linkArticleToFixture`) the halves follow the fixture's home and away,
 *     and the seam carries the final score (a report) or the kick-off time in
 *     Morocco time (a preview). With no fixture it carries nothing: a figure
 *     the data does not back is never drawn;
 *   - one club: its colour as a plate, its crest in the middle.
 *
 * Colours are the club palette's, so contrast is measured per theme, and the
 * pair goes through `clubMatchPalettes`, so two red clubs never paint one red
 * slab. Crests only: no photograph, no text baked into an image — the score
 * and the time are live text. The plate is decorative (`aria-hidden`): the
 * card's link already carries the headline.
 *
 * It is `absolute inset-0` inside the box `MediaImage` sizes, like the stock
 * plate it replaces, so it cannot move any card's layout. `size` says how big
 * that box is:
 *
 *   - `thumb`  the 88x68 row thumbnail: crests centred in each half, the seam
 *              figure under them;
 *   - `card`   the photo cards: crests at each half's outer edge, the figure
 *              on the seam, all in the top of the card (the headline sits on
 *              the lower part, on its own scrim);
 *   - `hero`   the article page's hero.
 */
export type ClubPlateSize = "thumb" | "card" | "hero";

const CREST: Record<ClubPlateSize, ClubCrestSize> = { thumb: "xs", card: "md", hero: "lg" };

/** The figure's box and type per size (`ui.score.*` are the kit's figure steps). */
const FIGURE: Record<ClubPlateSize, string> = {
  thumb: cn(
    ui.text.micro,
    "px-1 py-0.5 leading-none whitespace-nowrap [font-weight:var(--ui-weight-heavy)]",
  ),
  card: cn("px-3 py-0.5", ui.score.sm),
  hero: cn("px-4 py-1", ui.score.md),
};

export function ArticleClubPlate({
  clubs,
  fixture,
  size,
}: {
  /** One or two clubs, the first being the first half. */
  clubs: readonly Club[];
  fixture?: ArticleFixture | null;
  size: ClubPlateSize;
}) {
  const [first, second] = clubs;
  if (!first) return null;

  if (!second) {
    const palette = clubPalette(first);
    return (
      <div
        aria-hidden
        data-article-club-plate="single"
        {...clubStyle(palette)}
        className={cn(
          "absolute inset-0 flex justify-center overflow-hidden",
          ui.club.fill,
          ui.club.stripes,
          // Below the Save control at a thumbnail's corner; at the top of a
          // photo card, above its headline; centred in the article's hero
          // (less the sheet's overlap at its lower edge).
          size === "thumb" && "items-end pb-2",
          size === "card" && "items-start pt-5",
          size === "hero" && "items-center pb-6",
        )}
      >
        <ClubCrest
          club={first}
          palette={palette}
          tone="inverse"
          size={size === "thumb" ? "xs" : "lg"}
        />
      </div>
    );
  }

  const pair = clubMatchPalettes(first, second);
  const showFigure = fixture?.kind === "preview" || fixture?.kind === "result";
  return (
    <div
      aria-hidden
      data-article-club-plate="split"
      className="absolute inset-0 flex overflow-hidden"
    >
      <div {...clubStyle(pair.home)} className={cn("min-w-0 flex-1", ui.club.fillOnly)} />
      <div {...clubStyle(pair.away)} className={cn("min-w-0 flex-1", ui.club.fillOnly)} />
      {size === "thumb" ? (
        // 88x68: the scoreboard strip along the bottom (crest, figure, crest,
        // home first so Arabic puts it at the right), clear of the top band
        // where the Save control sits at the end corner. The crests are 22px
        // so a time ("18:00") fits between them; the ends are the thumbnail's
        // own edge, not the seam.
        <div
          data-article-thumb-strip=""
          className="pointer-events-none absolute inset-x-0.5 bottom-1.5 flex items-center justify-between"
        >
          <ClubCrest
            club={first}
            palette={pair.home}
            tone="inverse"
            size="xs"
            className="h-[22px] w-[22px]"
          />
          {showFigure && fixture && <Figure fixture={fixture} size={size} />}
          <ClubCrest
            club={second}
            palette={pair.away}
            tone="inverse"
            size="xs"
            className="h-[22px] w-[22px]"
          />
        </div>
      ) : (
        // A scoreboard strip centred on the seam: home crest, figure, away
        // crest. Centred, not pushed to the outer edges, so the Save control
        // at a photo card's top corner never lands on a crest. Home comes
        // first in the DOM, so Arabic puts it at the right.
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 flex items-center justify-center",
            showFigure ? "gap-3" : "gap-8",
            size === "card" ? "top-5" : "top-1/2 -translate-y-[60%]",
          )}
        >
          <ClubCrest club={first} palette={pair.home} tone="inverse" size={CREST[size]} />
          {showFigure && fixture && <Figure fixture={fixture} size={size} />}
          <ClubCrest club={second} palette={pair.away} tone="inverse" size={CREST[size]} />
        </div>
      )}
    </div>
  );
}

/**
 * The score as three flex children in a container that inherits the page
 * direction, each figure its own `<bdi>` (the kit's rule for a score), so the
 * home figure sits beside the home half in both languages. A kick-off time is
 * Morocco time, the product's clock, formatted with the application's own
 * formatter so the server and the browser agree.
 */
function Figure({ fixture, size }: { fixture: ArticleFixture; size: ClubPlateSize }) {
  const { lang } = useI18n();
  const box = cn(
    ui.surface.scorebox,
    size === "thumb" ? ui.radius.full : ui.radius.card,
    ui.shadow.lifted,
    FIGURE[size],
  );
  if (
    fixture.kind === "result" &&
    typeof fixture.homeScore === "number" &&
    typeof fixture.awayScore === "number"
  ) {
    return (
      <span className={cn("flex items-center", size === "thumb" ? "gap-1" : "gap-1.5", box)}>
        <bdi>{fixture.homeScore}</bdi>
        <span aria-hidden>–</span>
        <bdi>{fixture.awayScore}</bdi>
      </span>
    );
  }
  const time = moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(fixture.kickoff));
  return <bdi className={cn("block", box)}>{time}</bdi>;
}
