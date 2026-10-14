import { useState, type ReactNode } from "react";

import { CumChart, LeadChart, SignedBars } from "./plus-season-charts";
import { isMissing, RATING_CODES, type RatingCode } from "./plus-season-data";
import { useDuelPeople, useSeason } from "./plus-season-context";
import { Fig, Key, Num, PlusPanel, PlusTabs, RatingIcon, type PlusTab } from "./plus-season-ui";
import { usePlusCopy } from "./plus-copy";
import { ratingName, useFill, useSeasonFmt } from "./plus-season-fmt";

type DuelTab = "course" | "compare" | "decisions" | "notes";
const ID = "plus-s2d";

/**
 * « Détail du duel », opened from « Votre saison »: a header shared by its four tabs (the two
 * managers, journées won, a proportion bar, the lead in points) and the tabs Course, Comparaison,
 * Décisions and Notes. Rendered inside the offer's scrolling body. Example data
 * (`plus-season-data.ts`); the rival's side beyond per-journée scores is made up until lane C.
 */
export function PlusDuelScreen({ titleRef }: { titleRef: React.Ref<HTMLHeadingElement> }) {
  const { t } = usePlusCopy();
  return (
    <>
      <p className="ps-example">{t("plus.s2.example")}</p>
      <h1 className="plus-h ps-h1" id="plus-s2-title" tabIndex={-1} ref={titleRef}>
        {t("plus.s2.duel_title")}
      </h1>
      <PlusDuelBody />
    </>
  );
}

/**
 * The duel's header (the two managers, journées won, the proportion bar, the lead) and its four
 * tabs: the part the offer's step 2 and the in-app section share. It draws the season
 * `useSeason()` gives it, with the two managers' names from its `people` (the example's, from the
 * dictionary, by default).
 */
export function PlusDuelBody() {
  const { t, f } = usePlusCopy();
  const fill = useFill();
  const { S } = useSeason();
  const [tab, setTab] = useState<DuelTab>("course");
  const people = useDuelPeople({ you: t("plus.s2.me_name"), rival: t("plus.s2.rival_name") });
  const rivalName = people.rival.name;
  const tabs: PlusTab<DuelTab>[] = [
    { key: "course", label: t("plus.s2.tab_course") },
    { key: "compare", label: t("plus.s2.tab_compare") },
    { key: "decisions", label: t("plus.s2.tab_decisions") },
    { key: "notes", label: t("plus.s2.tab_notes") },
  ];
  return (
    <>
      <section className="ps-duel-head" aria-labelledby="ps-duel-hl">
        <div className="ps-vs">
          <div className="ps-side">
            <span className="ps-av" aria-hidden>
              {people.you.initials}
            </span>
            <b>
              <bdi>{people.you.name}</bdi>
            </b>
            {people.you.club ? (
              <small>
                <bdi dir="ltr">{people.you.club}</bdi>
              </small>
            ) : null}
          </div>
          <div className="ps-head-label">
            <p
              className="ps-score"
              dir="ltr"
              aria-label={fill("plus.s2.a_split", { a: S.wins, b: S.rivalWins, name: rivalName })}
            >
              <span className="a">
                <Num value={S.wins} />
              </span>
              <span className="dash" aria-hidden>
                –
              </span>
              <span className="b">
                <Num value={S.rivalWins} />
              </span>
            </p>
            <span className="ps-label">{t("plus.s2.won_label")}</span>
          </div>
          <div className="ps-side r">
            <span className="ps-av s" aria-hidden>
              {people.rival.initials}
            </span>
            <b>
              <bdi>{rivalName}</bdi>
            </b>
            {people.rival.club ? (
              <small>
                <bdi dir="ltr">{people.rival.club}</bdi>
              </small>
            ) : null}
          </div>
        </div>
        <div className="ps-split" aria-hidden>
          <i className="a ps-fx" style={{ flex: S.wins }} />
          <i className="b ps-fx end" style={{ flex: S.rivalWins }} />
        </div>
        <h2 className="ps-hl ps-head-label" id="ps-duel-hl">
          {f("plus.s2.lead_h", {
            name: <bdi>{rivalName}</bdi>,
            n: <Fig>{S.total - S.rivalTotal}</Fig>,
          })}
        </h2>
      </section>
      <PlusTabs
        id={ID}
        tabs={tabs}
        value={tab}
        onChange={setTab}
        label={t("plus.s2.duel_tabs_aria")}
      />
      <PlusPanel id={ID} tab={tab} key={tab}>
        {tab === "course" ? <CourseTab /> : null}
        {tab === "compare" ? <CompareTab /> : null}
        {tab === "decisions" ? <DecisionsTab /> : null}
        {tab === "notes" ? <NotesTab /> : null}
      </PlusPanel>
    </>
  );
}

/* ------------------------------------------------------------------------ Course */

function CourseTab() {
  const { t, f } = usePlusCopy();
  const { S, J } = useSeason();
  const { num, j, jAxis } = useSeasonFmt();
  const fill = useFill();
  const rivalName = useDuelPeople({ you: t("plus.s2.me_name"), rival: t("plus.s2.rival_name") })
    .rival.name;
  const firstLead = S.cumLead.findIndex((v, i) => i > 0 && v > 0 && S.cumLead[i - 1]! <= 0);
  const tiles: { label: string; value: ReactNode; sub: string; sky?: boolean }[] = [
    {
      label: t("plus.s2.t_win"),
      value: <Num value={S.bestLead} sign />,
      sub: j(S.bestLeadWeek + 1),
    },
    {
      label: t("plus.s2.t_loss"),
      value: <Num value={S.worstLead} sign />,
      sub: j(S.worstLeadWeek + 1),
      sky: true,
    },
    {
      label: t("plus.s2.t_peak"),
      value: <Num value={S.peakLead} sign />,
      sub: j(S.peakLeadWeek + 1),
    },
    {
      label: t("plus.s2.t_streak"),
      value: <Num value={S.streak} />,
      sub: t("plus.s2.t_streak_u"),
    },
  ];
  return (
    <>
      <section className="ps-card" aria-labelledby="ps-c-race">
        <h2 className="ps-hl" id="ps-c-race">
          {f("plus.s2.c_race_h", {
            a: <Fig>{S.total}</Fig>,
            b: <Fig className="sky">{S.rivalTotal}</Fig>,
          })}
        </h2>
        <Key
          items={[
            { cls: "k-you", label: t("plus.s2.you") },
            { cls: "k-rival", label: rivalName },
            { cls: "k-lead", label: t("plus.s2.k_lead") },
          ]}
        />
        <CumChart
          a={S.cumYou}
          b={S.cumRival}
          bKind="rival"
          jAxis={jAxis}
          label={fill("plus.s2.a_cum_rival", { a: S.total, b: S.rivalTotal, name: rivalName })}
        />
      </section>

      <section className="ps-card" aria-labelledby="ps-c-gap">
        <h2 className="ps-hl" id="ps-c-gap">
          {f("plus.s2.c_gap_h", { w: <Fig>{S.wins}</Fig>, n: <Fig>{J}</Fig> })}
        </h2>
        <Key
          items={[
            { cls: "sw m", label: t("plus.s2.k_ahead") },
            { cls: "sw sk", label: fill("plus.s2.k_behind", { name: rivalName }) },
          ]}
        />
        <SignedBars
          vals={S.lead}
          labels={S.lead.map((_, i) => (i === 0 ? jAxis(1) : String(i + 1)))}
          min={-8}
          max={9}
          ticks={[-5, 0, 5]}
          H={176}
          label={fill("plus.s2.a_gap", { name: rivalName })}
        />
      </section>

      <section className="ps-card" aria-labelledby="ps-c-turn">
        <h2 className="ps-hl" id="ps-c-turn">
          {f("plus.s2.c_turn_h", {
            j: <bdi>{j(firstLead < 0 ? Number.NaN : firstLead + 1)}</bdi>,
            p: <Fig>{num(S.peakLead, 0, true)}</Fig>,
          })}
        </h2>
        <LeadChart jAxis={jAxis} label={fill("plus.s2.a_lead", { name: rivalName })} />
      </section>

      <ul className="ps-tiles">
        {tiles.map((tile) => (
          <li className="ps-tile" key={tile.label}>
            <span className="ps-label">{tile.label}</span>
            <b className={`ps-mid ${tile.sky ? "sky" : ""}`}>{tile.value}</b>
            <span className="ps-label">
              <bdi>{tile.sub}</bdi>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* -------------------------------------------------------------------- Comparaison */

interface RowOpts {
  low?: boolean;
  neutral?: boolean;
  fmt?: (v: number) => string;
  sa?: string;
  sb?: string;
}

function MRow({ label, a, b, o = {} }: { label: string; a: number; b: number; o?: RowOpts }) {
  const { t } = usePlusCopy();
  let w = "";
  if (!isMissing(a) && !isMissing(b) && a !== b && !o.neutral)
    w = (o.low ? a < b : a > b) ? "l" : "r";
  const side = (v: number, sub: string | undefined, c: "l" | "r") => (
    <span className={`ps-mv${w === c ? " w" : ""}`}>
      <Fig>{o.fmt ? o.fmt(v) : v}</Fig>
      {sub ? <small>{sub}</small> : null}
      {w === c ? <span className="ps-sr">{t("plus.s2.m_better")}</span> : null}
    </span>
  );
  return (
    <div className="ps-mrow">
      {side(a, o.sa, "l")}
      <span className="ps-ml">{label}</span>
      {side(b, o.sb, "r")}
    </div>
  );
}

function CompareTab() {
  const { t } = usePlusCopy();
  const { S, raw: R, J } = useSeason();
  const fill = useFill();
  const { num, ord, j } = useSeasonFmt();
  const people = useDuelPeople({ you: t("plus.s2.me_name"), rival: t("plus.s2.rival_name") });
  const rivalName = people.rival.name;
  const rv = R.rival_;
  const sBest = Math.max(...R.rival);
  const sWorst = Math.min(...R.rival);
  const youBest = Math.max(...R.you);
  const youWorst = Math.min(...R.you);
  const dec = (v: number) => num(v, 1);
  const group = (title: string, rows: ReactNode) => (
    <section className="ps-card" aria-label={title}>
      <h2 className="ps-label">{title}</h2>
      <div className="ps-cmp">{rows}</div>
    </section>
  );
  return (
    <>
      <div className="ps-cmp-h" aria-hidden>
        <span>
          <bdi>{people.you.name}</bdi>
        </span>
        <span />
        <span>
          <bdi>{rivalName}</bdi>
        </span>
      </div>
      {group(
        t("plus.s2.g_overview"),
        <>
          <MRow label={t("plus.s2.b_points")} a={S.total} b={S.rivalTotal} />
          <MRow
            label={t("plus.s2.tile_avg")}
            a={+(S.total / J).toFixed(1)}
            b={+(S.rivalTotal / J).toFixed(1)}
            o={{ fmt: dec }}
          />
          <MRow
            label={t("plus.s2.tile_best")}
            a={youBest}
            b={sBest}
            o={{ sa: j(S.bestWeek + 1), sb: j(S.rivalBestWeek + 1) }}
          />
          <MRow
            label={t("plus.s2.b_worst")}
            a={youWorst}
            b={sWorst}
            o={{ sa: j(S.worstWeek + 1), sb: j(S.rivalWorstWeek + 1) }}
          />
          <MRow
            label={t("plus.s2.th_rank")}
            a={R.youRank[J - 1]!}
            b={R.rivalRank[J - 1]!}
            o={{ low: true, fmt: ord }}
          />
        </>,
      )}
      {group(
        ratingName(t, "CAP"),
        <>
          <MRow label={t("plus.s2.m_bonus")} a={S.captainTotal} b={rv.captain} />
          <MRow
            label={t("plus.s2.d_best_choice")}
            a={S.bestChoiceWeeks}
            b={rv.captainBest}
            o={{ fmt: (v) => `${v}/${J}` }}
          />
          <MRow
            label={t("plus.s2.d_left")}
            a={S.captainLeft}
            b={rv.bestStarters - rv.captain}
            o={{ low: true }}
          />
        </>,
      )}
      {group(
        ratingName(t, "TRF"),
        <>
          <MRow
            label={t("plus.s2.m_made")}
            a={S.transferCount}
            b={rv.transfers}
            o={{
              neutral: true,
              sa: fill("plus.s2.m_paid", { n: S.paidTransfers }),
              sb: fill("plus.s2.m_paid", { n: rv.paidTransfers }),
            }}
          />
          <MRow
            label={t("plus.s2.m_gain")}
            a={S.gross}
            b={rv.gross}
            o={{ fmt: (v) => num(v, 0, true) }}
          />
          <MRow
            label={t("plus.s2.l_penalties")}
            a={S.penalty}
            b={rv.penalty}
            o={{ low: true, fmt: (v) => num(-v) }}
          />
          <MRow
            label={t("plus.s2.m_net")}
            a={S.net}
            b={S.rivalNet}
            o={{ fmt: (v) => num(v, 0, true) }}
          />
        </>,
      )}
      {group(
        ratingName(t, "CON"),
        <>
          <MRow
            label={t("plus.s2.m_std")}
            a={+S.stdYou.toFixed(1)}
            b={+S.stdRival.toFixed(1)}
            o={{ low: true, fmt: dec }}
          />
          <MRow label={t("plus.s2.m_above")} a={S.above} b={S.rivalAbove} />
          <MRow label={t("plus.s2.m_tophalf")} a={S.topHalf} b={S.rivalTopHalf} />
          <MRow label={t("plus.s2.m_under50")} a={S.under50} b={S.rivalUnder50} o={{ low: true }} />
        </>,
      )}
    </>
  );
}

/* ----------------------------------------------------------------------- Décisions */

interface DualRow {
  label: string;
  a: number;
  b: number;
  max: number;
  fmt?: (v: number) => string;
  low?: boolean;
}

function dualWinner(r: DualRow): "l" | "r" | "t" {
  if (isMissing(r.a) || isMissing(r.b)) return "t";
  return r.a === r.b ? "t" : (r.low ? r.a < r.b : r.a > r.b) ? "l" : "r";
}

function Dual({ row, i }: { row: DualRow; i: number }) {
  const { t } = usePlusCopy();
  const win = dualWinner(row);
  const fmt = row.fmt ?? String;
  const bar = (v: number, c: "l" | "r") => (
    <div className={`ps-trk ${c}`}>
      <b
        className={`ps-fx ${c === "r" ? "end" : ""} ${win === c ? "win" : "lose"}`}
        style={{
          width: `${isMissing(v) ? 0 : (Math.abs(v) / row.max) * 100}%`,
          ["--i" as string]: i,
        }}
      />
    </div>
  );
  return (
    <div className="ps-drow">
      <div className="ps-dtop">
        <span className={`ps-dv l${win === "l" ? " w" : ""}`}>
          <Fig>{fmt(row.a)}</Fig>
          {win === "l" ? <span className="ps-sr">{t("plus.s2.m_better")}</span> : null}
        </span>
        <span className="ps-dl">{row.label}</span>
        <span className={`ps-dv r${win === "r" ? " w" : ""}`}>
          <Fig>{fmt(row.b)}</Fig>
          {win === "r" ? <span className="ps-sr">{t("plus.s2.m_better")}</span> : null}
        </span>
      </div>
      <div className="ps-dbars" aria-hidden>
        {bar(row.a, "l")}
        {bar(row.b, "r")}
      </div>
    </div>
  );
}

function DecisionsTab() {
  const { t, f } = usePlusCopy();
  const { S, raw: R, J } = useSeason();
  const { num } = useSeasonFmt();
  const rv = R.rival_;
  const people = useDuelPeople({ you: t("plus.s2.me_name"), rival: t("plus.s2.rival_name") });
  const rivalName = people.rival.name;
  const youBest = Math.max(...R.you);
  const sBest = Math.max(...R.rival);
  const points: DualRow[] = [
    { label: t("plus.s2.b_points"), a: S.total, b: S.rivalTotal, max: 700 },
    { label: t("plus.s2.t_wins"), a: S.wins, b: S.rivalWins, max: J },
    { label: t("plus.s2.tile_best"), a: youBest, b: sBest, max: 80 },
    { label: t("plus.s2.m_above"), a: S.above, b: S.rivalAbove, max: J },
  ];
  const decisions: DualRow[] = [
    { label: ratingName(t, "CAP"), a: S.captainTotal, b: rv.captain, max: 120 },
    { label: ratingName(t, "SEL"), a: S.starters, b: S.rivalStarters, max: 600 },
    {
      label: t("plus.s2.m_net"),
      a: S.net,
      b: S.rivalNet,
      max: 24,
      fmt: (v) => num(v, 0, true),
    },
  ];
  const who = (
    <div className="ps-who" aria-hidden>
      <span className="k">{t("plus.s2.you")}</span>
      <span className="s">
        <bdi>{rivalName}</bdi>
      </span>
    </div>
  );
  const terms: { label: string; v: number; cls?: string }[] = [
    { label: ratingName(t, "CAP"), v: S.gapTerms.captain },
    { label: ratingName(t, "SEL"), v: S.gapTerms.starters },
    { label: t("plus.s2.l_penalties"), v: S.gapTerms.penalty },
    { label: t("plus.s2.th_gap"), v: S.total - S.rivalTotal, cls: "mint" },
  ];
  return (
    <>
      <section className="ps-card" aria-label={t("plus.s2.b_points")}>
        <h2 className="ps-label">{t("plus.s2.b_points")}</h2>
        {who}
        {points.map((r, i) => (
          <Dual row={r} i={i} key={r.label} />
        ))}
      </section>
      <section className="ps-card" aria-label={t("plus.s2.tab_decisions")}>
        <h2 className="ps-label">{t("plus.s2.tab_decisions")}</h2>
        {who}
        {decisions.map((r, i) => (
          <Dual row={r} i={i} key={r.label} />
        ))}
        <ul className="ps-gapterms">
          {terms.map((term) => (
            <li key={term.label}>
              <b className={`ps-mid ${term.cls ?? (term.v >= 0 ? "" : "sky")}`}>
                <Fig>{num(term.v, 0, true)}</Fig>
              </b>
              <span className="ps-label">{term.label}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="ps-card ps-score-card" aria-labelledby="ps-x-cat">
        <h2 className="ps-hl" id="ps-x-cat">
          {f("plus.s2.x_cat_h", {
            k: <Fig>{S.categoriesWon}</Fig>,
            n: <Fig>{S.categoryCount}</Fig>,
          })}
        </h2>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- Notes */

function NotesTab() {
  const { t, f } = usePlusCopy();
  const { S, raw: R, leagueSize } = useSeason();
  const { rankOf } = useSeasonFmt();
  const rows: { code: RatingCode | "OVR"; a: number; b: number }[] = [
    { code: "OVR", a: S.ovr, b: S.rivalOvr },
    ...RATING_CODES.map((c) => ({ code: c, a: S.lastRating(c), b: R.rivalRating[c] })),
  ];
  return (
    <>
      <section className="ps-card" aria-labelledby="ps-n-hl2">
        <h2 className="ps-hl" id="ps-n-hl2">
          {f("plus.s2.nn_h", { a: <Fig>{S.ovr}</Fig>, b: <Fig className="sky">{S.rivalOvr}</Fig> })}
        </h2>
        <ul className="ps-matchup">
          {rows.map((row) => {
            const ra = R.ratingRank[row.code];
            const rb = R.rivalRatingRank[row.code];
            return (
              <li className="ps-mr" key={row.code}>
                <div className={`side l${row.a > row.b ? " w" : ""}`}>
                  <span className="n">
                    <Num value={row.a} />
                  </span>
                  <small>{rankOf(ra, leagueSize)}</small>
                </div>
                <div className="mid">
                  {row.code === "OVR" ? null : <RatingIcon code={row.code} size={24} />}
                  <span>{row.code === "OVR" ? t("card.ovr") : ratingName(t, row.code)}</span>
                </div>
                <div className={`side r${row.b > row.a ? " w" : ""}`}>
                  <span className="n">
                    <Num value={row.b} />
                  </span>
                  <small>{rankOf(rb, leagueSize)}</small>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
