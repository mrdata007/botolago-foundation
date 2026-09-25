import { ClubCrest } from "@/components/common/ClubCrest";
import { clubLabel } from "@/components/fantasy/club-identity";
import { RankOrdinal } from "@/components/fantasy-lists/RankOrdinal";
import { rankOrdinal } from "@/components/fantasy-lists/rank-ordinal";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { ClubStanding } from "@/lib/league-table";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import { gapLabel, pointsLabel, zoneLabel } from "./standings-copy";
import { FormChips } from "./StandingsTable";

/**
 * The reader's own club, above the table (A-Standings, from "Les enjeux"):
 * its rank as the hero figure, the African place or the drop it is in, its
 * last five results, and one line on how far the place above is — or, for
 * the leader, how far ahead it is. Only for a signed-in reader whose
 * favourite club is in the table; nobody else gets an empty card.
 *
 * The gradient bar on the start edge is the kit's "your position" bar, as on
 * the Fantasy rankings.
 *
 * A rank the club shares with clubs level on every figure says so ("Ex
 * æquo"), and names a zone only when the whole tie is in it (`clubStanding`).
 */
export function YourClubCard({ club, standing }: { club: Club; standing: ClubStanding }) {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const format = (value: number) => nf.format(value);
  const { row, zone, shared, gap } = standing;
  const summary = [
    pointsLabel(row.points, lang, t, format),
    gap ? gapLabel(gap, lang, t, format) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const standingLine = [
    shared ? t("standings.shared_rank") : null,
    zone ? zoneLabel(zone, t) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-labelledby="your-club-heading"
      className={cn(ui.surface.card, "flex gap-3 py-3.5 pe-4 ps-3.5")}
    >
      <span
        aria-hidden
        className={ui.edge.bar}
        style={{ backgroundImage: "var(--ui-grad-action)" }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 id="your-club-heading" className={cn(ui.text.label, ui.tone.muted)}>
            {t("standings.your_club")}
          </h2>
          <FormChips form={row.form} />
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <ClubCrest club={club} size="md" />
          <div className="min-w-0 flex-1">
            <p className={ui.display.team}>{clubLabel(club, tr)}</p>
            {standingLine ? (
              <p className={cn(ui.text.meta, ui.tone.muted)}>{standingLine}</p>
            ) : null}
          </div>
          <RankOrdinal
            parts={rankOrdinal(row.position, lang, t, format)}
            size="hero"
            className="shrink-0"
          />
        </div>
        <p
          className={cn(
            "pt-2.5",
            ui.rule.blockStart,
            ui.text.secondary,
            "[font-weight:var(--ui-weight-strong)]",
            ui.tone.default,
          )}
        >
          {summary}
        </p>
      </div>
    </section>
  );
}
