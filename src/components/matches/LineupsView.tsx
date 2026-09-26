import type { CSSProperties } from "react";
import type { MatchAbsenceDto, MatchLineupDto } from "@/backend/football/contracts";
import { ClubCrest } from "@/components/common/ClubCrest";
import { SectionHeader } from "@/components/common/SectionHeader";
import { EmptyState } from "@/components/common/States";
import { ui, UiCard } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import { Absences } from "./Absences";
import { lineBlockStart, pitchLines, slotInlineStart, sortStartingXi } from "./lineup-pitch";
import { noLineupsMessage, type MatchDataPhase } from "./match-empty-states";

// Pinned by `LineupsView.test.ts`; the helper itself lives in `lineup-pitch.ts`.
export { sortStartingXi };

type Lineup = MatchLineupDto;
type LineupPlayer = Lineup["players"][number];

/** Kept as a literal-key switch (not a lookup table) so every translation
 * lookup here stays statically visible to the i18n usage audit. */
function positionAbbreviation(t: (key: TranslationKey) => string, position: string | null) {
  switch (position) {
    case "goalkeeper":
      return t("matches.detail.position.gk");
    case "defender":
      return t("matches.detail.position.def");
    case "midfielder":
      return t("matches.detail.position.mid");
    case "forward":
      return t("matches.detail.position.fwd");
    default:
      return null;
  }
}

const starters = (lineup: Lineup) => lineup.players.filter((player) => player.slot === "starting");
const benchOf = (lineup: Lineup) =>
  lineup.players.filter((player) => player.slot === "bench").sort((a, b) => a.order - b.order);

/**
 * The Compos tab (A-Lineups), from the published lineups only.
 *
 * When both sides have a formation the pitch can honour, it is one vertical
 * pitch: the away XI in the top half attacking down, the home XI in the
 * bottom half attacking up, each under a band in its club colour with the
 * formation. Positions come from the formation and the position groups
 * (`lineup-pitch.ts`), placed with `inset-inline-start` percentages so the
 * pitch mirrors in Arabic like the rest of the page. The pitch is a picture
 * (hidden from assistive tech); the same XI is a list for screen readers.
 *
 * Only what the lineups payload carries: number, name, captain, formation,
 * whether it is confirmed. The board's coach line is not drawn (there is no
 * coach in the payload), nor its goal / substitution / card badges — those
 * are the timeline's, which the Résumé tab shows, and beside the discs they
 * collide as soon as a few substitutions have been made.
 *
 * Otherwise — one side missing, no formation, a player with no position — a
 * list per team, as before, rather than a guessed shape. Nothing published
 * at all is an explicit empty state, never a probable XI, and its message
 * follows `phase` (see `match-empty-states`): a finished match's lineups are
 * not "not yet published".
 *
 * Under it all, the players the provider lists as injured or suspended
 * (`Absences`), which are known before the lineups are.
 */
export function LineupsView({
  lineups,
  home,
  away,
  palettes,
  phase,
  absences = [],
}: {
  lineups: readonly Lineup[];
  home: Club;
  away: Club;
  palettes: { home: ClubPalette; away: ClubPalette };
  phase: MatchDataPhase;
  absences?: readonly MatchAbsenceDto[];
}) {
  const { t } = useI18n();
  const absent = <Absences absences={absences} home={home} away={away} palettes={palettes} />;

  const homeLineup = lineups.find((lineup) => lineup.team.id === home.id);
  const awayLineup = lineups.find((lineup) => lineup.team.id === away.id);

  if (!homeLineup && !awayLineup) {
    return (
      <div className="grid gap-4">
        <EmptyState>{noLineupsMessage(phase, t)}</EmptyState>
        {absent}
      </div>
    );
  }

  const homeLines = homeLineup ? pitchLines(starters(homeLineup), homeLineup.formation) : null;
  const awayLines = awayLineup ? pitchLines(starters(awayLineup), awayLineup.formation) : null;
  const sides = [
    homeLineup && { lineup: homeLineup, club: home, palette: palettes.home },
    awayLineup && { lineup: awayLineup, club: away, palette: palettes.away },
  ].filter((side): side is { lineup: Lineup; club: Club; palette: ClubPalette } => !!side);

  if (!homeLineup || !awayLineup || !homeLines || !awayLines) {
    return (
      <div className="grid gap-4">
        <h2 className="sr-only">{t("matches.detail.tab.lineups")}</h2>
        {sides.map((side) => (
          <TeamList key={side.club.id} {...side} />
        ))}
        {absent}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <h2 className="sr-only">{t("matches.detail.tab.lineups")}</h2>
      <div aria-hidden className={cn("overflow-hidden", ui.radius.sheet, ui.shadow.card)}>
        <TeamBand lineup={awayLineup} club={away} palette={palettes.away} />
        <div
          className="relative h-[33rem]"
          style={{
            // Mown bands, top to bottom only: a direction-neutral gradient.
            backgroundImage:
              "repeating-linear-gradient(to bottom, var(--ui-lineup-turf-a) 0 2.1875rem, var(--ui-lineup-turf-b) 2.1875rem 4.375rem)",
          }}
        >
          <PitchMarkings />
          {awayLines.map((line, lineIndex) =>
            line.map((player, index) => (
              <PlayerNode
                key={player.id}
                player={player}
                palette={palettes.away}
                inlineStart={slotInlineStart(index, line.length, true)}
                blockStart={lineBlockStart(lineIndex, awayLines.length, "away")}
              />
            )),
          )}
          {homeLines.map((line, lineIndex) =>
            line.map((player, index) => (
              <PlayerNode
                key={player.id}
                player={player}
                palette={palettes.home}
                inlineStart={slotInlineStart(index, line.length, false)}
                blockStart={lineBlockStart(lineIndex, homeLines.length, "home")}
              />
            )),
          )}
        </div>
        <TeamBand lineup={homeLineup} club={home} palette={palettes.home} />
      </div>

      {/* The pitch, as a list: formation, then the XI line by line. */}
      <div className="sr-only">
        {sides.map(({ lineup, club }) => (
          <ScreenReaderXi key={club.id} lineup={lineup} club={club} />
        ))}
      </div>

      <Bench sides={sides} />
      {absent}
    </div>
  );
}

function ScreenReaderXi({ lineup, club }: { lineup: Lineup; club: Club }) {
  const { t, tr } = useI18n();
  return (
    <section>
      <h3>
        {tr(club.name)}
        {lineup.formation ? ` · ${lineup.formation}` : ""}
        {!lineup.confirmed ? ` · ${t("matches.detail.lineup_provisional")}` : ""}
      </h3>
      <p>{t("matches.detail.starting_xi")}</p>
      <ol>
        {sortStartingXi(starters(lineup)).map((player) => (
          <li key={player.id}>
            {player.shirtNumber !== null ? `${player.shirtNumber} ` : ""}
            {player.displayName}
            {player.captain ? `, ${t("matches.detail.captain")}` : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A club band over (away) or under (home) the pitch: crest, name, formation. */
function TeamBand({ lineup, club, palette }: { lineup: Lineup; club: Club; palette: ClubPalette }) {
  const { t, tr } = useI18n();
  return (
    <div
      {...clubStyle(palette)}
      className={cn("flex min-h-11 items-center gap-2 px-3 py-1.5", ui.club.fill)}
    >
      <ClubCrest club={club} palette={palette} size="xs" tone="inverse" />
      <span className={cn("min-w-0 truncate", ui.display.teamSm)}>{tr(club.name)}</span>
      {lineup.formation ? (
        // A formation reads left to right in both languages ("4-2-3-1").
        // A surface pill with the club colour as text (≥ 4.5:1 by the
        // palette's rule), not the board's white-16% glass: on a fill that
        // only just carries white (Raja, Berkane), glass takes small text
        // under 3.5:1.
        <bdi
          dir="ltr"
          className={cn("shrink-0 px-2 py-0.5", ui.radius.full, ui.club.inverse, ui.stat.sm)}
        >
          {lineup.formation}
        </bdi>
      ) : null}
      {!lineup.confirmed ? (
        <span className={cn("ms-auto shrink-0", ui.text.label)}>
          {t("matches.detail.lineup_provisional")}
        </span>
      ) : null}
    </div>
  );
}

/** Touchlines, halfway line, centre circle and the two boxes, in white at 42%. */
function PitchMarkings() {
  const line = "border-[color:color-mix(in_srgb,var(--ui-on-ink-plain)_42%,transparent)]";
  return (
    <>
      <span className={cn("absolute inset-x-2.5 inset-y-1.5 border-[1.5px]", line)} />
      <span className={cn("absolute inset-x-2.5 top-1/2 border-t-[1.5px]", line)} />
      <span
        className={cn(
          "absolute inset-x-0 top-1/2 mx-auto h-21 w-21 -translate-y-1/2 border-[1.5px]",
          ui.radius.full,
          line,
        )}
      />
      <span
        className={cn("absolute inset-x-[25%] top-1.5 h-15.5 border-[1.5px] border-t-0", line)}
      />
      <span
        className={cn("absolute inset-x-[37.5%] top-1.5 h-5.5 border-[1.5px] border-t-0", line)}
      />
      <span
        className={cn("absolute inset-x-[25%] bottom-1.5 h-15.5 border-[1.5px] border-b-0", line)}
      />
      <span
        className={cn("absolute inset-x-[37.5%] bottom-1.5 h-5.5 border-[1.5px] border-b-0", line)}
      />
    </>
  );
}

/**
 * One starter: a disc in the club colour with the shirt number (a white ring
 * keeps it a shape on the turf whatever the club), the captain's armband on
 * its corner, and the name on the turf in white — 4.84:1 or better on the
 * lineup turf in both themes, so no text shadow.
 */
function PlayerNode({
  player,
  palette,
  inlineStart,
  blockStart,
}: {
  player: LineupPlayer;
  palette: ClubPalette;
  inlineStart: number;
  blockStart: number;
}) {
  const { t } = useI18n();
  // Centre the 88px node on its slot with a logical offset, not a
  // translate, so the same numbers are right in both directions.
  const position: CSSProperties = {
    insetInlineStart: `calc(${inlineStart}% - 2.75rem)`,
    insetBlockStart: `calc(${blockStart}% - 0.9375rem)`,
  };
  return (
    <div className="absolute flex w-22 flex-col items-center gap-0.5" style={position}>
      <span
        {...clubStyle(palette)}
        className={cn(
          "relative grid h-7.5 w-7.5 place-items-center",
          ui.radius.full,
          ui.club.fill,
          "ring-2 ring-[color:var(--ui-on-ink-plain)]",
          ui.shadow.card,
        )}
      >
        {player.shirtNumber !== null ? (
          <span className={ui.stat.sm}>{player.shirtNumber}</span>
        ) : null}
        {player.captain ? (
          <span
            title={t("matches.detail.captain")}
            className={cn(
              // On the top corner: the name label sits under the disc.
              "absolute -start-1.5 -top-1 grid h-4 w-4 place-items-center",
              ui.radius.full,
              ui.text.micro,
              "bg-[color:var(--ui-caution)] text-[color:var(--ui-on-caution)] [font-weight:var(--ui-weight-heavy)]",
            )}
          >
            C
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "max-w-full truncate",
          ui.text.micro,
          "[font-weight:var(--ui-weight-strong)]",
          ui.tone.onInkPlain,
        )}
      >
        {player.displayName}
      </span>
    </div>
  );
}

/** The substitutes of both sides, under the pitch. */
function Bench({ sides }: { sides: { lineup: Lineup; club: Club; palette: ClubPalette }[] }) {
  const { t, tr } = useI18n();
  const withBench = sides.filter((side) => benchOf(side.lineup).length > 0);
  if (withBench.length === 0) return null;
  return (
    <section>
      <SectionHeader title={t("matches.detail.substitutes")} as="h3" />
      <UiCard padding="sm" className="grid gap-4 sm:grid-cols-2">
        {withBench.map(({ lineup, club, palette }) => (
          <div key={club.id} className="min-w-0">
            {/* A div, not a p: the crest is a div. */}
            <div className={cn("flex items-center gap-2", ui.text.label, ui.tone.muted)}>
              <ClubCrest club={club} palette={palette} size="xs" />
              <span className="truncate">{tr(club.shortName)}</span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {benchOf(lineup).map((player) => (
                <li
                  key={player.id}
                  className={cn(
                    "inline-flex min-w-0 max-w-full items-center gap-1.5 px-2.5 py-1",
                    ui.radius.full,
                    ui.surface.sunken,
                    ui.text.meta,
                  )}
                >
                  {player.shirtNumber !== null ? (
                    <span className={cn(ui.stat.sm, ui.tone.muted)}>{player.shirtNumber}</span>
                  ) : null}
                  <span className="truncate">{player.displayName}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </UiCard>
    </section>
  );
}

/**
 * The fallback when the pitch cannot be drawn honestly: one card per team,
 * its band in the club colour, then the XI and the bench as lists.
 */
function TeamList({ lineup, club, palette }: { lineup: Lineup; club: Club; palette: ClubPalette }) {
  const { t } = useI18n();
  const starting = sortStartingXi(starters(lineup));
  const bench = benchOf(lineup);
  return (
    <div className={cn("overflow-hidden", ui.surface.card, ui.radius.sheet)}>
      <TeamBand lineup={lineup} club={club} palette={palette} />
      <div className="px-4 pb-4 pt-3">
        <p className={cn(ui.text.label, ui.tone.muted)}>{t("matches.detail.starting_xi")}</p>
        <ul className="mt-2 grid gap-1">
          {starting.map((player) => {
            const position = positionAbbreviation(t, player.position);
            return (
              <li
                key={player.id}
                className={cn("flex min-h-8 items-center gap-2.5", ui.text.secondary)}
              >
                <span
                  {...clubStyle(palette)}
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center",
                    ui.radius.full,
                    ui.club.fill,
                    ui.club.ring,
                  )}
                >
                  {player.shirtNumber !== null ? (
                    <span className={ui.stat.sm}>{player.shirtNumber}</span>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate [font-weight:var(--ui-weight-strong)]">
                  {player.displayName}
                </span>
                {position ? (
                  <span className={cn(ui.text.label, ui.tone.muted)}>{position}</span>
                ) : null}
                {player.captain ? (
                  <span
                    aria-label={t("matches.detail.captain")}
                    title={t("matches.detail.captain")}
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center",
                      ui.radius.full,
                      ui.text.micro,
                      "bg-[color:var(--ui-caution)] text-[color:var(--ui-on-caution)] [font-weight:var(--ui-weight-heavy)]",
                    )}
                  >
                    C
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {bench.length > 0 && (
          <div className={cn("mt-3 pt-3", ui.rule.blockStart)}>
            <p className={cn(ui.text.label, ui.tone.muted)}>{t("matches.detail.substitutes")}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {bench.map((player) => (
                <li
                  key={player.id}
                  className={cn(
                    "inline-flex min-w-0 max-w-full items-center gap-1.5 px-2.5 py-1",
                    ui.radius.full,
                    ui.surface.sunken,
                    ui.text.meta,
                  )}
                >
                  {player.shirtNumber !== null ? (
                    <span className={cn(ui.stat.sm, ui.tone.muted)}>{player.shirtNumber}</span>
                  ) : null}
                  <span className="truncate">{player.displayName}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
