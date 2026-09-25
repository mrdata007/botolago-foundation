import type { ReactNode } from "react";
import { ClubCrest } from "@/components/common/ClubCrest";
import { rankOrdinal } from "@/components/fantasy-lists/rank-ordinal";
import { formatGoalDifference } from "@/components/matches/head-to-head";
import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import type { Club, TableRow } from "@/types/domain";

/**
 * The top of a club page (A-Club): the club's own colour, edge to edge on a
 * phone and a lifted feature card from `sm`, as the match header is — with
 * the diagonal club stripes (their angle mirrors in Arabic), the crest as a
 * surface disc, and the name as the page's `<h1>`.
 *
 * `row` is the club's line in the season's table. With one, the four figures
 * that say where the club stands sit on a card that rises out of the band's
 * foot, as the player page draws its key numbers. Without one — before the
 * first round, or a season with no table — there is no card rather than a
 * card of dashes. A position the club shares with clubs level on every
 * figure (`shared`, see `sharedPositions`) is labelled "Ex æquo" rather than
 * "Position": the figure is the tie's, not the club's alone.
 *
 * `actions` sit under the name, on the club colour: the follow control and
 * the season picker.
 */
export function ClubHero({
  club,
  headingId,
  kicker,
  row,
  shared = false,
  actions,
}: {
  club: Club;
  headingId: string;
  /** The competition and season the page is showing, above the name. */
  kicker: string;
  row: TableRow | undefined;
  /** Other clubs in the table hold `row.position` too. */
  shared?: boolean;
  actions?: ReactNode;
}) {
  const { t, tr, lang } = useI18n();
  const colours = clubStyle(club);
  const name = tr(club.name);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const position = row ? rankOrdinal(row.position, lang, t, (n) => nf.format(n)) : null;

  return (
    <>
      <section
        aria-labelledby={headingId}
        data-club={colours["data-club"]}
        style={colours.style}
        className={cn(
          // Flush under the bar and edge to edge on a phone (cancelling the
          // screen's gutter and top padding); a feature card from `sm`.
          "relative -mx-[var(--ui-gutter)] -mt-4 px-[var(--ui-gutter)] pt-6",
          row ? "pb-14" : "pb-6",
          "sm:mx-0 sm:mt-0 sm:rounded-[var(--ui-radius-sheet)] sm:px-6 sm:shadow-[var(--ui-shadow-lifted)]",
          ui.club.fill,
          ui.club.stripes,
        )}
      >
        <div className="flex items-center gap-4">
          <ClubCrest club={club} size="lg" tone="inverse" loading="eager" />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate", ui.text.label)}>{kicker}</p>
            {/* A long name ("Renaissance Club Athletic Zemamra") steps down a
                size rather than breaking inside a word. */}
            <h1
              id={headingId}
              className={cn(
                "mt-1 text-balance",
                name.length > 18 ? ui.display.section : ui.display.title,
              )}
            >
              {name}
            </h1>
          </div>
        </div>
        {actions ? <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </section>

      {row && position ? (
        <UiCard
          padding="none"
          className={cn("relative z-10 -mt-10 overflow-hidden", ui.radius.sheet, ui.shadow.lifted)}
        >
          <dl className="grid grid-cols-4 py-3.5">
            {/* The figure alone in Arabic, whose ordinal is a word before it
                ("المركز 5") that the label above already says. */}
            <KeyNumber
              label={shared ? t("standings.shared_rank") : t("matches.table.rank")}
              value={`${position.figure}${position.after}`}
            />
            <KeyNumber label={t("matches.table.points")} value={nf.format(row.points)} divided />
            <KeyNumber label={t("club.key.played")} value={nf.format(row.played)} divided />
            <KeyNumber
              label={t("club.key.goal_difference")}
              value={formatGoalDifference(row.goalDifference)}
              divided
            />
          </dl>
        </UiCard>
      ) : null}
    </>
  );
}

/** One figure on the key-numbers card: the label under it, as the player page sets them. */
function KeyNumber({
  label,
  value,
  divided = false,
}: {
  label: string;
  value: string;
  divided?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col-reverse items-center justify-end gap-0.5 px-0.5 text-center",
        divided && ui.rule.inline,
      )}
    >
      <dt className={cn("max-w-full text-balance", ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd className={cn("max-w-full truncate", ui.stat.lg, ui.tone.default)}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}
