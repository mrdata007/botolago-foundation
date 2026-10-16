import { ArrowLeftRight, Clock, Flag, Info, Users } from "lucide-react";
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { ShareImageSheet } from "@/components/common/ShareImageSheet";
import { renderRecapImage } from "@/components/fantasy/recap-image";
import type { CareerMember } from "@/backend/premium/card-reads";
import type { RecapChip, RecapCause, RoundRecapView } from "@/backend/premium/round-recap";
import type { LeagueSeries } from "@/backend/premium/league-context";
import { useMyCareer } from "@/services/use-premium-card-reads";
import { useLeagueContext } from "@/services/use-premium-league-context";
import { useRoundRecap } from "@/services/use-premium-round-recap";
import { cn } from "@/lib/utils";

import { PlusLogo } from "./PlusLogo";
import { PlusEmbed, PlusLockedSection } from "./PlusLockedSection";
import type { PlusAccess } from "./plus-access";
import { PLUS_NAME, formatPlusDate, usePlusCopy } from "./plus-copy";
import { EXAMPLE_RECAP_VIEW } from "./plus-recap-example";
import { StandingHead, type Standing } from "./PlusSeasonSection";
import { useSeasonFmt } from "./plus-season-fmt";

import "./plus-recap.css";

/** The address fragment the section answers to (the paywall returns here). */
export const RECAP_SECTION_ID = "votre-journee";

/** What the season strip shows: figures the career and league reads already serve. */
export interface RecapSeasonFacts {
  total: number | null;
  rank: number | null;
  size: number | null;
  journees: number;
  bestWeek: { seq: number; score: number } | null;
  bestTransfer: { seq: number; out: string; into: string; gain: number } | null;
  worstTransfer: { seq: number; out: string; into: string; gain: number } | null;
  captainHits: number | null;
  captainWeeks: number | null;
  hits: number;
  hitPoints: number;
}

/** The example season of the blurred preview (journée 11 of Karim B.'s season). */
const EXAMPLE_SEASON: RecapSeasonFacts = {
  total: 612,
  rank: 3,
  size: 5,
  journees: 11,
  bestWeek: { seq: 8, score: 81 },
  bestTransfer: { seq: 8, out: "M. Tahiri", into: "A. Chakir", gain: 11 },
  worstTransfer: { seq: 6, out: "H. Lamrani", into: "S. Idrissi", gain: -2 },
  captainHits: 7,
  captainWeeks: 11,
  hits: 3,
  hitPoints: 12,
};

/**
 * « Votre journée expliquée » on Curva's card page. The slot (`PlusRecapSlot`) decides `access`
 * (`usePlusAccess()`) and hands over what the free screens already load:
 *   - off: null (no node, no request);
 *   - locked: the reader's real points and league position clear on top, the example journée blurred
 *     below with the lock and « Découvrir ». The paid read is not called;
 *   - member: the journée explained on the pitch, from `api.get_round_recap`, and the season so far.
 */
export function PlusRecapSection({
  access,
  standing = null,
  leagueId = null,
  leaguePending = false,
  teamName = null,
}: {
  access: PlusAccess;
  standing?: Standing | null;
  /** The private league the Curva screen is showing: the comparison is made with it. */
  leagueId?: string | null;
  /** The screen does not know its league yet; the read waits for it. */
  leaguePending?: boolean;
  /** What the share picture calls the manager. */
  teamName?: string | null;
}) {
  if (access === "off") return null;
  return access === "locked" ? (
    <LockedRecap standing={standing} />
  ) : (
    <MemberRecap leagueId={leagueId} leaguePending={leaguePending} teamName={teamName} />
  );
}

function LockedRecap({ standing }: { standing: Standing | null }) {
  const { t } = usePlusCopy();
  return (
    <PlusLockedSection
      id={RECAP_SECTION_ID}
      testId="plus-recap-locked"
      headline={t("plus.recap.locked_title")}
      head={
        standing ? (
          <StandingHead
            totalScore={standing.totalScore}
            rank={standing.rank}
            size={standing.size}
          />
        ) : null
      }
    >
      <RecapBody view={EXAMPLE_RECAP_VIEW} season={EXAMPLE_SEASON} example />
    </PlusLockedSection>
  );
}

function MemberRecap({
  leagueId,
  leaguePending,
  teamName,
}: {
  leagueId: string | null;
  leaguePending: boolean;
  teamName: string | null;
}) {
  const { t } = usePlusCopy();
  const [gameweekId, setGameweekId] = useState<string | null>(null);
  const recap = useRoundRecap(!leaguePending, leagueId, gameweekId);
  const career = useMyCareer(true);
  const league = useLeagueContext(!leaguePending, leagueId);
  const season = useMemo(
    () => (career.data ? seasonFacts(career.data, league.data ?? null) : null),
    [career.data, league.data],
  );
  const titleId = useId();

  let body: ReactNode;
  if (leaguePending || recap.isPending) {
    body = (
      <>
        <div className="pl-skeleton" aria-hidden />
        <span className="sr-only">{t("plus.recap.loading")}</span>
      </>
    );
  } else if (recap.isError) {
    body = <p className="pr-note">{t("plus.recap.failed")}</p>;
  } else if (!recap.data) {
    body = <p className="pr-note">{t("plus.recap.empty")}</p>;
  } else {
    body = (
      <RecapBody
        view={recap.data}
        season={season}
        teamName={teamName}
        onPick={(id) => setGameweekId(id)}
      />
    );
  }
  return (
    <PlusEmbed
      id={RECAP_SECTION_ID}
      className="plus-embed--night plus-recap"
      data-testid="plus-recap"
      aria-labelledby={titleId}
    >
      <h2 className="sr-only" id={titleId}>
        {t("plus.recap.title")}
      </h2>
      {body}
    </PlusEmbed>
  );
}

/** The career and the league's figures as the season strip's facts. */
export function seasonFacts(career: CareerMember, league: LeagueSeries | null): RecapSeasonFacts {
  const total = league?.youTotal ?? career.weeks.reduce((sum, week) => sum + week.score, 0);
  const pick = (item: CareerMember["transfers"]["best"]) =>
    item && item.gain !== null
      ? { seq: item.gameweekSeq, out: item.playerOut, into: item.playerIn, gain: item.gain }
      : null;
  const best = career.bestWeeks[0] ?? null;
  return {
    total,
    rank: league?.youSeasonRank ?? null,
    size: league?.leagueSize ?? null,
    journees: career.weeks.length,
    bestWeek: best ? { seq: best.gameweekSeq, score: best.score } : null,
    bestTransfer: pick(career.transfers.best),
    worstTransfer: pick(career.transfers.worst),
    captainHits: career.captain.weeksCounted > 0 ? career.captain.hits : null,
    captainWeeks: career.captain.weeksCounted > 0 ? career.captain.weeksCounted : null,
    hits: career.weeks.filter((week) => week.transferHit > 0).length,
    hitPoints: career.weeks.reduce((sum, week) => sum + week.transferHit, 0),
  };
}

// ---------------------------------------------------------------------------
// The journée: head, pitch, bench, causes, notes, share
// ---------------------------------------------------------------------------

/** Whole numbers plain, others with one decimal; a true minus sign; `sign` adds the plus. */
function useNumber() {
  const { num } = useSeasonFmt();
  const { lang } = usePlusCopy();
  // A signed figure keeps its sign on the correct side in Arabic text: a left-to-right isolate.
  return (n: number, sign = false) => {
    const value = num(n, Number.isInteger(n) ? 0 : 1, sign);
    return lang === "ar" ? `\u2066${value}\u2069` : value;
  };
}

/** A name, isolated in Arabic text so its dots and dashes stay with it. */
function useName() {
  const { lang } = usePlusCopy();
  // Kept on one line (no-break spaces) so a Latin name is never split across two Arabic lines.
  return (name: string) => (lang === "ar" ? `\u2068${name.replace(/ /g, "\u00a0")}\u2069` : name);
}

function RecapBody({
  view,
  season,
  example = false,
  teamName = null,
  onPick,
}: {
  view: RoundRecapView;
  season: RecapSeasonFacts | null;
  /** The blurred example: inert, no picker and no share. */
  example?: boolean;
  teamName?: string | null;
  onPick?: (gameweekId: string) => void;
}) {
  const { t, text, lang } = usePlusCopy();
  const { rankOf, num } = useSeasonFmt();
  const n = useNumber();
  const nm = useName();
  const ltr = (value: string) => (lang === "ar" ? `\u2066${value}\u2069` : value);
  const [cause, setCause] = useState<RecapCause>("captain");
  const selectId = useId();

  const waiting = !view.settled || view.pendingPlayers > 0;
  const gap = view.vsLeague;
  const headline =
    gap === null
      ? text("plus.recap.headline_plain", { n: view.seq, score: n(view.score) })
      : gap > 0
        ? text("plus.recap.headline_more", { n: view.seq, score: n(view.score), gap: n(gap) })
        : gap < 0
          ? text("plus.recap.headline_less", {
              n: view.seq,
              score: n(view.score),
              gap: n(Math.abs(gap)),
            })
          : text("plus.recap.headline_same", { n: view.seq, score: n(view.score) });
  const published = view.publishedAt
    ? text("plus.recap.published", {
        date: formatPlusDate(lang, new Date(view.publishedAt), true),
      })
    : null;
  const movement =
    view.movement === null
      ? null
      : view.movement > 0
        ? text("plus.recap.move_up", { n: n(view.movement, true) })
        : view.movement < 0
          ? text("plus.recap.move_down", { n: n(-Math.abs(view.movement)) })
          : t("plus.recap.move_same");
  const size = view.league?.members ?? null;

  const captain = view.captain;
  const transfer = view.transfers[0] ?? null;
  const pendingNames = view.pitch.flatMap((line) =>
    line.chips.filter((chip) => chip.pending).map((chip) => chip.name),
  );
  const unit = t("plus.recap.unit");
  const pts = (value: number) => `${n(value)} ${unit}`;

  const captainLine = captain
    ? captain.pending || captain.counted === null
      ? text("plus.recap.captain_plain", { name: nm(captain.name), formula: "—" })
      : captain.vsLeague !== null && captain.multiplier !== null && captain.multiplier > 1
        ? text("plus.recap.captain_line", {
            name: nm(captain.name),
            formula: ltr(
              `${num(captain.points ?? 0)} × ${num(captain.multiplier)} = ${num(captain.counted)}`,
            ),
            gap: n(captain.vsLeague, true),
          })
        : text("plus.recap.captain_plain", { name: nm(captain.name), formula: n(captain.counted) })
    : null;
  const transferLine = (item: RoundRecapView["transfers"][number]) =>
    item.pending || item.gain === null || item.net === null
      ? text("plus.recap.transfer_wait", { out: nm(item.playerOut), in: nm(item.playerIn) })
      : item.hitShare > 0
        ? text("plus.recap.transfer_line", {
            out: nm(item.playerOut),
            in: nm(item.playerIn),
            gain: n(item.gain, true),
            hit: n(-item.hitShare),
            net: n(item.net, true),
          })
        : text("plus.recap.transfer_free", {
            out: nm(item.playerOut),
            in: nm(item.playerIn),
            gain: n(item.gain, true),
          });

  const lines = [
    captainLine,
    transfer ? transferLine(transfer) : null,
    view.others !== null ? `${t("plus.recap.cause_others")} : ${n(view.others, true)}` : null,
  ].filter((line): line is string => line !== null);

  const benchTotal = view.bench.reduce((sum, player) => sum + (player.points ?? 0), 0);
  const shareHeading =
    gap === null
      ? text("plus.recap.share_heading_plain", { n: view.seq })
      : text("plus.recap.share_heading", { n: view.seq, gap: n(gap, true) });
  const shareLines = waiting
    ? [...lines, text("plus.recap.share_waiting", { n: Math.max(1, view.pendingPlayers) })]
    : lines;
  const shareLinesTrimmed = shareLines.slice(0, 3);

  return (
    <div className="pr" data-testid="plus-recap-body">
      <div className="pr__main">
        <header className="pr__head">
          <div className="pr__top">
            <PlusLogo label={PLUS_NAME} decorative />
            <span className="pr__stamp" data-testid="plus-recap-stamp">
              {text("plus.recap.journee", { n: view.seq })}
              {" · "}
              {published ?? t("plus.recap.waiting_chip")}
            </span>
          </div>
          <h3 className="pr__headline" data-testid="plus-recap-headline">
            {headline}
          </h3>
          <div className="pr__plate-row">
            <div className="pr__plate" data-testid="plus-recap-score">
              <b className="pr__big">
                <bdi dir="ltr">{n(view.score)}</bdi>
              </b>
              <span className="pr__unit">
                <b>{t("plus.recap.pts")}</b>
                {waiting ? <span>{t("plus.recap.waiting")}</span> : null}
              </span>
            </div>
            {view.rank !== null ? (
              <span className="pr__pill" data-testid="plus-recap-rank">
                {size !== null ? rankOf(view.rank, size) : n(view.rank)}
                {movement ? ` · ${movement}` : ""}
              </span>
            ) : null}
          </div>
          {view.average !== null || view.best !== null ? (
            <dl className="pr__stats">
              {view.average !== null ? (
                <div>
                  <dt>{t("plus.recap.avg")}</dt>
                  <dd>
                    <bdi dir="ltr">{n(view.average)}</bdi>
                  </dd>
                </div>
              ) : null}
              {view.best !== null ? (
                <div>
                  <dt>{t("plus.recap.best")}</dt>
                  <dd>
                    <bdi dir="ltr">{n(view.best)}</bdi>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {!example && view.journees.length > 1 && onPick ? (
            <div className="pr__pick">
              <label htmlFor={selectId} className="sr-only">
                {t("plus.recap.select_label")}
              </label>
              <select
                id={selectId}
                className="pr__select"
                value={view.gameweekId}
                onChange={(event) => onPick(event.target.value)}
                data-testid="plus-recap-select"
              >
                {view.journees.map((journee) => (
                  <option key={journee.id} value={journee.id}>
                    {text("plus.recap.journee", { n: journee.seq })}
                    {journee.settled ? "" : ` · ${t("plus.recap.waiting")}`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </header>

        <section
          className="pr__pitchwrap"
          aria-label={text("plus.recap.pitch_title", { n: view.seq })}
        >
          <div className="pr__pitchhead">
            <h4 className="pr__h">{text("plus.recap.pitch_title", { n: view.seq })}</h4>
          </div>
          <div className="pr__pitch" data-testid="plus-recap-pitch">
            <span className="pr__lines" aria-hidden />
            <span className="pr__circle" aria-hidden>
              <span className="pr__mark" />
            </span>
            <span className="pr__sweep" aria-hidden />
            <div className="pr__rows">
              {view.pitch.map((line, index) => (
                <div
                  key={line.row}
                  className="pr__row"
                  style={{ "--pr-row": view.pitch.length - 1 - index } as CSSProperties}
                >
                  {line.chips.map((chip) => (
                    <Chip key={chip.fantasyPlayerId} chip={chip} active={chip.cause === cause} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="pr__bench" data-testid="plus-recap-bench">
            <span className="pr__bench-label">{t("plus.recap.bench")}</span>
            <ul className="pr__bench-chips">
              {view.bench.map((player) => (
                <li
                  key={player.fantasyPlayerId}
                  className={cn("pr__chip pr__chip--sm", !player.played && "pr__chip--dnp")}
                >
                  <span className="pr__nm">{player.name}</span>
                  <span className="pr__pt">
                    {player.pending ? (
                      t("plus.recap.waiting")
                    ) : (
                      <bdi dir="ltr">{n(player.points ?? 0)}</bdi>
                    )}
                  </span>
                  {!player.played ? (
                    <span className="pr__tiny">{t("plus.recap.did_not_play")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <span className="pr__bench-total">
              {text("plus.recap.bench_total", { pts: benchTotal })}
            </span>
          </div>
          <p className="pr__legend">
            <span>
              <i className="pr__sw pr__sw--lit" aria-hidden />
              {t("plus.recap.legend_lit")}
            </span>
            <span>
              <i className="pr__sw pr__sw--hatch" aria-hidden />
              {t("plus.recap.legend_wait")}
            </span>
          </p>
        </section>

        <section className="pr__rail" aria-label={t("plus.recap.causes_title")}>
          <h4 className="pr__h">{t("plus.recap.causes_title")}</h4>
          <p className="pr__hint">{t("plus.recap.causes_hint")}</p>
          {view.average !== null ? (
            <div className="pr__wrow">
              <span className="pr__wl">{t("plus.recap.league_avg")}</span>
              <b className="pr__wv">
                <bdi dir="ltr">{n(view.average)}</bdi>
              </b>
              <Track kind="avg" start={0} end={Math.min(1, view.average / 100)} />
            </div>
          ) : null}
          {captain ? (
            <CauseButton
              id="captain"
              active={cause === "captain"}
              onPick={setCause}
              icon={<Flag aria-hidden />}
              title={t("plus.recap.cause_captain")}
              text={`${captainLine ?? ""}${captain.usedVice ? ` · ${t("plus.recap.captain_vice")}` : ""}`}
              value={captain.vsLeague}
            />
          ) : null}
          {transfer ? (
            <CauseButton
              id="transfer"
              active={cause === "transfer"}
              onPick={setCause}
              icon={<ArrowLeftRight aria-hidden />}
              title={t("plus.recap.cause_transfer")}
              text={view.transfers.map(transferLine).join(" · ")}
              value={view.transfersNet}
            />
          ) : null}
          {view.others !== null ? (
            <CauseButton
              id="others"
              active={cause === "others"}
              onPick={setCause}
              icon={<Users aria-hidden />}
              title={`${t("plus.recap.cause_others")} : ${n(view.others, true)}`}
              text={t("plus.recap.others_line")}
              value={view.others}
              remainder
            />
          ) : null}
          <div className="pr__wrow pr__wrow--you">
            <span className="pr__wl">
              {t("plus.recap.you")}
              {waiting ? ` · ${t("plus.recap.waiting")}` : ""}
            </span>
            <b className="pr__wv">
              <bdi dir="ltr">{n(view.score)}</bdi>
            </b>
            <Track kind="you" start={0} end={Math.min(1, view.score / 100)} />
          </div>
          {view.reconciled ? (
            <p className="pr__calc" data-testid="plus-recap-parts">
              <span>{text("plus.recap.part_starters", { n: n(view.startingPoints) })}</span>
              {view.chip === "bench_boost" && view.benchPoints > 0 ? (
                <span>{text("plus.recap.part_bench", { n: n(view.benchPoints, true) })}</span>
              ) : null}
              <span>{text("plus.recap.part_captain", { n: n(view.captainBonus, true) })}</span>
              {view.transferHit > 0 ? (
                <span>{text("plus.recap.part_hit", { n: n(-view.transferHit) })}</span>
              ) : null}
              <b>{text("plus.recap.part_total", { n: n(view.score) })}</b>
            </p>
          ) : null}
          <ul className="pr__facts">
            {pendingNames.length > 0 ? (
              <li>
                <Clock aria-hidden />
                {pendingNames.length === 1
                  ? text("plus.recap.pending_one", { name: nm(pendingNames[0]!) })
                  : text("plus.recap.pending_many", { n: pendingNames.length })}
              </li>
            ) : null}
            {view.benchPoints > 0 ? (
              <li>
                <Info aria-hidden />
                {text(
                  view.chip === "bench_boost"
                    ? "plus.recap.bench_note_boost"
                    : "plus.recap.bench_note",
                  {
                    pts: n(view.benchPoints),
                  },
                )}
              </li>
            ) : null}
            <li>
              <Info aria-hidden />
              {t("plus.recap.absences")}
            </li>
          </ul>
          <p className="pr__note">
            {view.league
              ? view.average === null
                ? t("plus.recap.small_league")
                : text("plus.recap.league_note", { n: view.league.members })
              : t("plus.recap.no_league")}
          </p>
          {view.corrected ? <p className="pr__meta">{t("plus.recap.corrected")}</p> : null}
          {!example ? (
            <div className="pr__share">
              <ShareImageSheet
                label={t("plus.recap.share")}
                campaign="plus_round_recap"
                testIdPrefix="plus-recap"
                testId="plus-recap-share"
                aspect="post"
                fileName={`botolago-journee-${view.seq}.png`}
                imageAlt={text("plus.recap.image_alt", { n: view.seq })}
                renderKey={`${view.gameweekId}:${view.calculationVersion}:${view.score}:${lang}`}
                message={text("plus.recap.share_message", { n: view.seq, points: n(view.score) })}
                path="/fantasy"
                render={() =>
                  renderRecapImage({
                    lang,
                    kicker: t("plus.recap.title"),
                    heading: shareHeading,
                    teamName: teamName ?? "BotolaGO",
                    total: n(view.score),
                    unit: t("plus.recap.pts"),
                    lines: shareLinesTrimmed,
                    footer: t("plus.recap.share_footer"),
                  })
                }
              />
              <span className="pr__share-label" aria-hidden>
                {t("plus.recap.share")}
              </span>
            </div>
          ) : null}
        </section>
      </div>
      {season ? <SeasonStrip season={season} /> : null}
    </div>
  );
}

function Chip({ chip, active }: { chip: RecapChip; active: boolean }) {
  const { t } = usePlusCopy();
  const n = useNumber();
  const points = chip.points;
  const level = points === null ? null : points >= 9 ? 9 : points >= 8 ? 8 : points >= 7 ? 7 : 6;
  return (
    <div
      className={cn(
        "pr__chip",
        level !== null && `pr__chip--l${level}`,
        points !== null && points >= 8 && "pr__chip--lit",
        chip.pending && "pr__chip--wait",
        active && "pr__chip--on",
      )}
      data-cause={chip.cause}
      data-testid="plus-recap-chip"
    >
      <span className="pr__nm">{chip.name}</span>
      <span className="pr__pt">
        {chip.pending ? (
          <span className="pr__pw">{t("plus.recap.waiting")}</span>
        ) : (
          <bdi dir="ltr">{n(points ?? 0)}</bdi>
        )}
      </span>
      {chip.cause === "captain" ? (
        <span className="pr__badge pr__badge--arm" title={t("plus.recap.captain_badge")}>
          C
        </span>
      ) : chip.cause === "transfer" ? (
        <span className="pr__badge pr__badge--swp" title={t("plus.recap.transfer_badge")}>
          <ArrowLeftRight aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

function Track({ kind, start, end }: { kind: "avg" | "you"; start: number; end: number }) {
  return (
    <span className="pr__track" aria-hidden>
      <i
        className={`pr__bar pr__bar--${kind}`}
        style={{ insetInlineStart: `${start * 100}%`, inlineSize: `${(end - start) * 100}%` }}
      />
    </span>
  );
}

function CauseButton({
  id,
  active,
  onPick,
  icon,
  title,
  text,
  value,
  remainder = false,
}: {
  id: RecapCause;
  active: boolean;
  onPick: (cause: RecapCause) => void;
  icon: ReactNode;
  title: string;
  text: string;
  value: number | null;
  remainder?: boolean;
}) {
  const n = useNumber();
  const width = value === null ? 0 : Math.min(0.5, Math.abs(value) / 40);
  const negative = value !== null && value < 0;
  return (
    <button
      type="button"
      className="pr__cause"
      aria-pressed={active}
      onClick={() => onPick(id)}
      data-testid={`plus-recap-cause-${id}`}
    >
      <span className="pr__ci">{icon}</span>
      <span className="pr__ct">
        <b className="pr__ck">{title}</b>
        <span className="pr__cx">{text}</span>
      </span>
      {value !== null ? (
        <b className={cn("pr__cv", negative ? "pr__cv--neg" : "pr__cv--pos")}>
          <bdi dir="ltr">{n(value, true)}</bdi>
        </b>
      ) : null}
      <span className="pr__track pr__track--cause" aria-hidden>
        <i className="pr__tick" />
        <i
          className={cn(
            "pr__bar",
            remainder ? "pr__bar--rem" : negative ? "pr__bar--neg" : "pr__bar--pos",
          )}
          style={
            negative
              ? { insetInlineEnd: "50%", inlineSize: `${width * 100}%` }
              : { insetInlineStart: "50%", inlineSize: `${width * 100}%` }
          }
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// The season so far
// ---------------------------------------------------------------------------

function SeasonStrip({ season }: { season: RecapSeasonFacts }) {
  const { t, text } = usePlusCopy();
  const nm = useName();
  const { rankOf } = useSeasonFmt();
  const n = useNumber();
  const title =
    season.total === null
      ? null
      : season.rank !== null && season.size !== null
        ? text("plus.recap.season_title", {
            pts: n(season.total),
            rank: rankOf(season.rank, season.size),
            n: season.journees,
          })
        : text("plus.recap.season_title_plain", { pts: n(season.total), n: season.journees });
  const transferText = (item: NonNullable<RecapSeasonFacts["bestTransfer"]>) =>
    text("plus.recap.tile_transfer_v", {
      out: nm(item.out),
      in: nm(item.into),
      gain: n(item.gain, true),
      n: item.seq,
    });
  return (
    <section className="pr__season" data-testid="plus-recap-season" aria-label={title ?? undefined}>
      {title ? <h3 className="pr__headline pr__headline--season">{title}</h3> : null}
      <ul className="pr__tiles">
        {season.bestWeek ? (
          <Tile
            label={t("plus.recap.tile_best_week")}
            value={text("plus.recap.tile_best_week_v", {
              n: season.bestWeek.seq,
              pts: n(season.bestWeek.score),
            })}
          />
        ) : null}
        {season.bestTransfer ? (
          <Tile
            label={t("plus.recap.tile_best_transfer")}
            value={transferText(season.bestTransfer)}
          />
        ) : null}
        {season.worstTransfer ? (
          <Tile
            label={t("plus.recap.tile_worst_transfer")}
            value={transferText(season.worstTransfer)}
            negative
          />
        ) : null}
        {season.captainHits !== null && season.captainWeeks !== null ? (
          <Tile
            label={t("plus.recap.tile_captain")}
            value={text("plus.recap.tile_captain_v", {
              k: season.captainHits,
              n: season.captainWeeks,
            })}
          />
        ) : null}
        <Tile
          label={t("plus.recap.tile_hits")}
          value={text("plus.recap.tile_hits_v", {
            k: season.hits,
            pts: n(-season.hitPoints),
          })}
          negative={season.hitPoints > 0}
        />
      </ul>
      <p className="pr__note">{t("plus.recap.season_note")}</p>
    </section>
  );
}

function Tile({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <li className={cn("pr__tile", negative && "pr__tile--neg")}>
      <span className="pr__tk">{label}</span>
      <b className="pr__tv">{value}</b>
    </li>
  );
}
