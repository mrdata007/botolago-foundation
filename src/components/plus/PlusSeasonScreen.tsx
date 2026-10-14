import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { TranslationKey } from "@/i18n/dictionaries";

import { PlusDuelScreen } from "./PlusDuelScreen";
import {
  CaptainChart,
  CumChart,
  OvrChart,
  PointsBars,
  SignedBars,
  Spark,
} from "./plus-season-charts";
import {
  JOURNEES,
  LEAGUE_SIZE,
  RATING_CODES,
  SEASON,
  SEASON_RAW,
  TRANSFER_PENALTY,
  type RatingCode,
} from "./plus-season-data";
import {
  Fig,
  Key,
  Num,
  PlusPanel,
  PlusTabs,
  RatingIcon,
  SignTri,
  type PlusTab,
} from "./plus-season-ui";
import { usePlusCopy } from "./plus-copy";
import { ratingName, useFill, useSeasonFmt } from "./plus-season-fmt";

type SeasonTab = "resume" | "points" | "decisions" | "note";
const ID = "plus-s2";
const S = SEASON;
const R = SEASON_RAW;
const J = JOURNEES;

/**
 * Screen 2, « Votre saison »: four pill tabs (Résumé, Points, Décisions, Note) over one example
 * season, and the way into « Détail du duel » (`PlusDuelScreen`). One headline per block, written as
 * the finding with its number; labels stay to a few words, the full sentences live in `aria-label`s.
 * Every figure is computed from `plus-season-data.ts`.
 */
export function PlusSeasonScreen({
  onNext,
  titleRef,
  duelOpen,
  onDuel,
}: {
  onNext: () => void;
  titleRef: React.Ref<HTMLHeadingElement>;
  duelOpen: boolean;
  onDuel: (open: boolean) => void;
}) {
  const { t } = usePlusCopy();
  const [tab, setTab] = useState<SeasonTab>("resume");
  const scroller = useRef<HTMLDivElement>(null);

  // Opening or closing the duel starts its screen at the top.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [duelOpen]);

  const tabs: PlusTab<SeasonTab>[] = [
    { key: "resume", label: t("plus.s2.tab_resume") },
    { key: "points", label: t("plus.s2.tab_points") },
    { key: "decisions", label: t("plus.s2.tab_decisions") },
    { key: "note", label: t("plus.s2.tab_note") },
  ];

  return (
    <>
      <div className="plus-body ps-body" ref={scroller}>
        {duelOpen ? (
          <PlusDuelScreen titleRef={titleRef} />
        ) : (
          <>
            <p className="ps-example">{t("plus.s2.example")}</p>
            <h1 className="plus-h ps-h1" id="plus-s2-title" tabIndex={-1} ref={titleRef}>
              {t("plus.s2.title")}
            </h1>
            <PlusTabs
              id={ID}
              tabs={tabs}
              value={tab}
              onChange={setTab}
              label={t("plus.s2.tabs_aria")}
            />
            <PlusPanel id={ID} tab={tab} key={tab}>
              {tab === "resume" ? <ResumeTab onDuel={() => onDuel(true)} /> : null}
              {tab === "points" ? <PointsTab /> : null}
              {tab === "decisions" ? <DecisionsTab /> : null}
              {tab === "note" ? <NoteTab /> : null}
            </PlusPanel>
          </>
        )}
      </div>
      <div className="plus-foot">
        <button type="button" className="plus-btn plus-btn--primary" onClick={onNext}>
          {t("plus.s2.cta")}
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ Résumé */

function ResumeTab({ onDuel }: { onDuel: () => void }) {
  const { t, f } = usePlusCopy();
  const { num } = useSeasonFmt();
  const fill = useFill();
  const above = S.total - S.leagueTotal;
  const best = S.bestWeek;
  const tiles = [
    {
      label: t("plus.s2.tile_avg"),
      value: <Num value={S.total / J} decimals={1} />,
      delta: S.total / J - S.leagueTotal / J,
      d: 1,
    },
    {
      label: t("plus.s2.tile_best"),
      value: <Num value={R.you[best]!} />,
      delta: R.you[best]! - R.leagueAvg[best]!,
      d: 0,
    },
    {
      label: ratingName(t, "CAP"),
      value: <Num value={S.captainTotal} />,
      delta: S.captainVsLeague,
      d: 0,
    },
    {
      label: t("plus.s2.tile_net"),
      value: <Num value={S.net} sign />,
      delta: S.netVsLeague,
      d: 0,
    },
  ];
  return (
    <>
      <section className="ps-hero" aria-labelledby="ps-r-hl">
        <h2 className="ps-hl" id="ps-r-hl">
          {f("plus.s2.r_above", {
            n: (
              <span className="ps-big mint" style={{ display: "block" }}>
                <Num value={above} sign />
              </span>
            ),
          })}
        </h2>
      </section>
      <ul className="ps-trio" aria-label={t("plus.s2.r_trio_aria")}>
        <li>
          <span className="ps-label">{t("plus.s2.r_league")}</span>
          <b className="ps-mid">
            <Num value={S.leagueTotal} />
          </b>
        </li>
        <li className="me">
          <span className="ps-label">{t("plus.s2.you")}</span>
          <b className="ps-mid">
            <Num value={S.total} />
          </b>
        </li>
        <li>
          <span className="ps-label">{t("plus.s2.r_best")}</span>
          <b className="ps-mid">
            <Num value={R.leaderTotal} />
          </b>
        </li>
      </ul>
      <section aria-labelledby="ps-r-vs">
        <h2 className="ps-label" id="ps-r-vs" style={{ marginBlockEnd: 12 }}>
          {t("plus.s2.r_vs")}
        </h2>
        <ul className="ps-tiles">
          {tiles.map((tile) => {
            const good = tile.delta >= 0;
            return (
              <li className="ps-tile" key={tile.label}>
                <span className="ps-label">{tile.label}</span>
                <b className="ps-mid">{tile.value}</b>
                <span
                  className={`ps-chip ${good ? "good" : "bad"}`}
                  aria-label={fill("plus.s2.vs_league_aria", {
                    n: num(tile.delta, tile.d, true),
                  })}
                >
                  <SignTri up={good} />
                  {f("plus.s2.vs_league", {
                    n: <bdi dir="ltr">{num(tile.delta, tile.d, true)}</bdi>,
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="ps-duel-card" aria-labelledby="ps-r-duel">
        <h2 className="ps-hl" id="ps-r-duel">
          {f("plus.s2.lead_h", {
            name: <bdi>{t("plus.s2.rival_name")}</bdi>,
            n: <Fig>{S.total - S.rivalTotal}</Fig>,
          })}
        </h2>
        <p
          className="ps-score-line"
          dir="ltr"
          aria-label={fill("plus.s2.a_split", {
            a: S.wins,
            b: S.rivalWins,
            name: t("plus.s2.rival_name"),
          })}
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
        <button type="button" className="ps-linkbtn" onClick={onDuel}>
          {t("plus.s2.duel_open")}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------------- Points */

function PointsTab() {
  const { t, f } = usePlusCopy();
  const { num, ord, j, jAxis } = useSeasonFmt();
  const fill = useFill();
  const best = S.bestWeek;
  const worst = S.worstWeek;
  const gross = S.starters + S.captainTotal;

  const balance: {
    label: string;
    hint?: string;
    you: string;
    league: string;
    gap: number;
    d: number;
  }[] = [
    {
      label: t("plus.s2.b_points"),
      you: num(S.total),
      league: num(S.leagueTotal),
      gap: S.total - S.leagueTotal,
      d: 0,
    },
    {
      label: t("plus.s2.tile_avg"),
      you: num(S.total / J, 1),
      league: num(S.leagueTotal / J, 1),
      gap: S.total / J - S.leagueTotal / J,
      d: 1,
    },
    {
      label: t("plus.s2.tile_best"),
      hint: j(best + 1),
      you: num(R.you[best]!),
      league: num(R.leagueAvg[best]!),
      gap: R.you[best]! - R.leagueAvg[best]!,
      d: 0,
    },
    {
      label: t("plus.s2.b_worst"),
      hint: j(worst + 1),
      you: num(R.you[worst]!),
      league: num(R.leagueAvg[worst]!),
      gap: R.you[worst]! - R.leagueAvg[worst]!,
      d: 0,
    },
    {
      label: t("plus.s2.tile_net"),
      you: num(S.net, 0, true),
      league: num(R.leagueNetTransfers, 0, true),
      gap: S.netVsLeague,
      d: 0,
    },
  ];

  return (
    <>
      <section className="ps-card" aria-labelledby="ps-p-cum">
        <h2 className="ps-hl" id="ps-p-cum">
          {f("plus.s2.p_cum_h", {
            n: <Fig>{S.total}</Fig>,
            d: <Fig>{num(S.total - S.leagueTotal, 0, true)}</Fig>,
          })}
        </h2>
        <Key
          items={[
            { cls: "k-you", label: t("plus.s2.you") },
            { cls: "k-ref", label: t("plus.s2.k_league") },
          ]}
        />
        <CumChart
          a={S.cumYou}
          b={S.cumLeague}
          bKind="ref"
          jAxis={jAxis}
          label={fill("plus.s2.a_cum_league", { a: S.total, b: S.leagueTotal })}
        />
      </section>

      <section className="ps-card" aria-labelledby="ps-p-bars">
        <h2 className="ps-hl" id="ps-p-bars">
          {f("plus.s2.p_bars_h", {
            pts: <Fig>{R.you[best]}</Fig>,
            j: <bdi>{j(best + 1)}</bdi>,
          })}
        </h2>
        <Key
          items={[
            { cls: "sw up", label: t("plus.s2.k_above") },
            { cls: "sw dn", label: t("plus.s2.k_below") },
            { cls: "k-ref", label: t("plus.s2.k_league") },
          ]}
        />
        <PointsBars
          jAxis={jAxis}
          label={fill("plus.s2.a_bars", { best: j(best + 1), pts: R.you[best]! })}
        />
      </section>

      <section className="ps-card" aria-labelledby="ps-p-src">
        <h2 className="ps-sr" id="ps-p-src">
          {fill("plus.s2.a_src", {
            t: S.total,
            a: S.starters,
            b: S.captainTotal,
            c: S.penalty,
          })}
        </h2>
        <p className="ps-eqn" dir="ltr" aria-hidden>
          <Fig>{S.starters}</Fig>
          <span className="op">+</span>
          <Fig>{S.captainTotal}</Fig>
          <span className="op">&minus;</span>
          <Fig>{S.penalty}</Fig>
          <span className="op">=</span>
          <Fig className="res">{S.total}</Fig>
        </p>
        <div className="ps-stack" aria-hidden>
          <i className="s1 ps-fx" style={{ width: `${(S.starters / gross) * 100}%` }} />
          <i
            className="s2 ps-fx"
            style={{ width: `${(S.captainTotal / gross) * 100}%`, ["--i" as string]: 1 }}
          />
        </div>
        <ul className="ps-legend">
          <li>
            <i className="d s1" aria-hidden />
            {ratingName(t, "SEL")}
            <b>
              <Fig>{S.starters}</Fig>
            </b>
          </li>
          <li>
            <i className="d s2" aria-hidden />
            {ratingName(t, "CAP")}
            <b>
              <Fig>{num(S.captainTotal, 0, true)}</Fig>
            </b>
          </li>
          <li>
            <i className="d s3" aria-hidden />
            {t("plus.s2.l_penalties")}
            <b className="dn">
              <Fig>{num(-S.penalty)}</Fig>
            </b>
          </li>
        </ul>
      </section>

      <section className="ps-card" aria-labelledby="ps-p-bil">
        <h2 className="ps-label" id="ps-p-bil">
          {t("plus.s2.p_balance")}
        </h2>
        <table className="ps-table">
          <thead>
            <tr>
              <td />
              <th scope="col">{t("plus.s2.you")}</th>
              <th scope="col">{t("plus.s2.k_league")}</th>
              <th scope="col">{t("plus.s2.th_gap")}</th>
            </tr>
          </thead>
          <tbody>
            {balance.map((row) => (
              <tr key={row.label}>
                <th scope="row">
                  {row.label}
                  {row.hint ? <small>{row.hint}</small> : null}
                </th>
                <td className="you">
                  <Fig>{row.you}</Fig>
                </td>
                <td>
                  <Fig>{row.league}</Fig>
                </td>
                <td className={row.gap >= 0 ? "up" : "dn"}>
                  <Fig>{num(row.gap, row.d, true)}</Fig>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ps-card" aria-labelledby="ps-p-led">
        <h2 className="ps-label" id="ps-p-led">
          {t("plus.s2.p_ledger")}
        </h2>
        <table className="ps-table" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <td style={{ inlineSize: 52 }} />
              <th scope="col">{t("plus.s2.you")}</th>
              <th scope="col" style={{ inlineSize: 52 }}>
                {t("plus.s2.th_avg")}
              </th>
              <th scope="col" style={{ inlineSize: 52 }}>
                {t("plus.s2.th_max")}
              </th>
              <th scope="col" style={{ inlineSize: 92 }}>
                {t("plus.s2.th_rank")}
              </th>
            </tr>
          </thead>
          <tbody>
            {R.you.map((v, i) => {
              const d = v - R.leagueAvg[i]!;
              const r = R.youRank[i]!;
              const prev = i === 0 ? r : R.youRank[i - 1]!;
              return (
                <tr key={i}>
                  <th scope="row">
                    <bdi>{jAxis(i + 1)}</bdi>
                  </th>
                  <td className="you">
                    <Fig>{v}</Fig>
                    <small className={d >= 0 ? "up" : "dn"}>
                      <Fig>{num(d, 0, true)}</Fig>
                    </small>
                  </td>
                  <td>
                    <Fig>{R.leagueAvg[i]}</Fig>
                  </td>
                  <td>
                    <Fig>{R.leagueBest[i]}</Fig>
                  </td>
                  <td className="rk">
                    {i > 0 && r !== prev ? (
                      <span className={`mv ${r < prev ? "up" : "dn"}`}>
                        <SignTri up={r < prev} />
                        <Fig>{Math.abs(r - prev)}</Fig>
                      </span>
                    ) : i > 0 ? (
                      <span className="mv" aria-hidden>
                        =
                      </span>
                    ) : null}
                    <em>
                      <bdi>{ord(r)}</bdi>
                    </em>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------------- Décisions */

function DecisionsTab() {
  const { t, f } = usePlusCopy();
  const { num, j, jAxis } = useSeasonFmt();
  const fill = useFill();
  const bt = S.bestTransferWeek;
  const wt = S.worstTransferWeek;
  const jAxisLabels = R.transfers.map((w) => j(w[0]));
  return (
    <>
      <section className="ps-card" aria-labelledby="ps-d-cap">
        <h2 className="ps-hl" id="ps-d-cap">
          {f("plus.s2.d_cap_h", { d: <Fig>{num(S.captainVsLeague, 0, true)}</Fig> })}
        </h2>
        <Key
          items={[
            { cls: "sw m", label: ratingName(t, "CAP") },
            { cls: "sw h", label: t("plus.s2.k_left") },
          ]}
        />
        <CaptainChart jAxis={jAxis} label={t("plus.s2.a_cap")} />
        <div className="ps-pair">
          <div>
            <b className="ps-mid sky">
              <Num value={S.captainLeft} />
            </b>
            <span className="who">{t("plus.s2.d_left")}</span>
          </div>
          <div>
            <b className="ps-mid">
              <Fig>
                {S.bestChoiceWeeks}/{J}
              </Fig>
            </b>
            <span className="who">{t("plus.s2.d_best_choice")}</span>
          </div>
        </div>
      </section>

      <section className="ps-card" aria-labelledby="ps-d-trf">
        <h2 className="ps-hl" id="ps-d-trf">
          {f("plus.s2.d_trf_h", {
            n: <Fig>{num(S.net, 0, true)}</Fig>,
            l: <Fig>{num(R.leagueNetTransfers, 0, true)}</Fig>,
          })}
        </h2>
        <Key
          items={[
            { cls: "sw m", label: t("plus.s2.k_gain") },
            { cls: "sw sk", label: t("plus.s2.k_loss") },
          ]}
        />
        <SignedBars
          vals={S.netByWeek}
          labels={R.transfers.map((w) => String(w[0]))}
          min={-8}
          max={14}
          ticks={[-5, 0, 10]}
          bw={28}
          H={170}
          label={fill("plus.s2.a_trf", {
            weeks: jAxisLabels.join(", "),
            penalty: TRANSFER_PENALTY,
          })}
        />
        <div className="ps-pair">
          <div>
            <span className="ps-label">{f("plus.s2.d_best_t", { j: <bdi>{j(bt[0])}</bdi> })}</span>
            <b className="ps-mid mint">
              <Fig>{num(bt[1] - bt[2], 0, true)}</Fig>
            </b>
            <span className="who">
              <bdi>{R.bestTransfer.from}</bdi> <ArrowRight className="ps-arrow" aria-hidden />{" "}
              <bdi>{R.bestTransfer.to}</bdi>
            </span>
          </div>
          <div>
            <span className="ps-label">{f("plus.s2.d_worst_t", { j: <bdi>{j(wt[0])}</bdi> })}</span>
            <b className="ps-mid sky">
              <Fig>{num(wt[1] - wt[2], 0, true)}</Fig>
            </b>
            <span className="who">
              <bdi>{R.worstTransfer.from}</bdi> <ArrowRight className="ps-arrow" aria-hidden />{" "}
              <bdi>{R.worstTransfer.to}</bdi>
            </span>
          </div>
        </div>
      </section>

      <section className="ps-card" aria-labelledby="ps-d-con">
        <h2 className="ps-hl" id="ps-d-con">
          {f("plus.s2.d_con_h", { k: <Fig>{S.above}</Fig>, n: <Fig>{J}</Fig> })}
        </h2>
        <SignedBars
          vals={S.vsLeague}
          labels={Array.from({ length: J }, (_, i) => (i === 0 ? jAxis(1) : String(i + 1)))}
          min={-6}
          max={16}
          ticks={[-5, 0, 10]}
          H={180}
          label={t("plus.s2.a_reg")}
        />
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- Note */

function NoteTab() {
  const { t, f } = usePlusCopy();
  const { num, ord, rankOf, jAxis } = useSeasonFmt();
  const fill = useFill();
  const ovr = S.ovr;
  const delta = ovr - S.leagueOvr;
  const rank = R.ratingRank;
  const strong = RATING_CODES.filter((c) => rank[c] <= 3).sort((a, b) => rank[a] - rank[b]);
  const weak = RATING_CODES.filter((c) => rank[c] > LEAGUE_SIZE / 2);
  const order = [...RATING_CODES].sort((a, b) => S.contributions[b] - S.contributions[a]);
  return (
    <>
      <section className="ps-hero" aria-labelledby="ps-n-hl">
        <h2 className="ps-label" id="ps-n-hl">
          {t("plus.s2.n_overall")}
        </h2>
        <b className="ps-big mint">
          <Num value={ovr} />
        </b>
        <div className="ps-hero-row">
          <span className="ps-chip rank">{rankOf(rank.OVR, LEAGUE_SIZE)}</span>
          <span className={`ps-chip ${delta >= 0 ? "good" : "bad"}`}>
            <SignTri up={delta >= 0} />
            {f("plus.s2.vs_league", { n: <bdi dir="ltr">{num(delta, 0, true)}</bdi> })}
          </span>
        </div>
        <OvrChart
          jAxis={jAxis}
          label={fill("plus.s2.a_ovr", {
            a: S.ovrSeries[0]!,
            b: ovr,
            n: J,
            l: S.leagueOvr,
          })}
        />
        <Key
          items={[
            { cls: "k-you", label: t("plus.s2.you") },
            { cls: "k-ref", label: fill("plus.s2.n_league", { n: S.leagueOvr }) },
          ]}
        />
      </section>

      <ul className="ps-stats">
        {RATING_CODES.map((code, ix) => {
          const v = S.lastRating(code);
          const avg = R.leagueRating[code];
          const r = rank[code];
          return (
            <li className="ps-stat" key={code}>
              <div className="ps-stat-top">
                <span className="ps-ic">
                  <RatingIcon code={code} />
                </span>
                <span className="ps-stat-name">{ratingName(t, code)}</span>
                <b className="ps-stat-val">
                  <Num value={v} />
                </b>
                <span className={`ps-chip ${r <= 4 ? "rank" : "plain"}`}>
                  {rankOf(r, LEAGUE_SIZE)}
                </span>
              </div>
              <div className="ps-stat-mid">
                <div
                  className="ps-meter"
                  role="img"
                  aria-label={fill("plus.s2.a_stat", {
                    name: ratingName(t, code),
                    v,
                    l: avg,
                  })}
                >
                  <i
                    className="ps-fx"
                    style={{ width: `${(v / 99) * 100}%`, ["--i" as string]: ix }}
                  />
                  <u style={{ insetInlineStart: `${(avg / 99) * 100}%` }} />
                </div>
                <Spark vals={R.ratings[code]} avg={avg} />
              </div>
              <div className="ps-stat-foot">
                <span>{fill("plus.s2.n_league", { n: avg })}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="ps-card">
        <div className="ps-tags">
          <div className="ps-tagrow">
            <span className="ps-tag p">{t("plus.s2.n_strong")}</span>
            {strong.map((c) => (
              <span className="ps-chip good" key={c}>
                {ratingName(t, c)} · {ord(rank[c])}
              </span>
            ))}
          </div>
          <div className="ps-tagrow">
            <span className="ps-tag n">{t("plus.s2.n_work")}</span>
            {weak.map((c) => (
              <span className="ps-chip bad" key={c}>
                {ratingName(t, c)} · {ord(rank[c])}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="ps-card" aria-labelledby="ps-n-build">
        <h2 className="ps-hl" id="ps-n-build">
          <bdi dir="ltr">
            (<Fig>{S.lastRating("CAP")}</Fig> + <Fig>{S.lastRating("SEL")}</Fig> +{" "}
            <Fig>{S.lastRating("TRF")}</Fig> + <Fig>{S.lastRating("CON")}</Fig>) ÷ 4 ={" "}
            <Fig>{ovr}</Fig>
          </bdi>
        </h2>
        <div className="ps-build-head">
          <span>{fill("plus.s2.n_league", { n: S.leagueOvr })}</span>
          <span className="mint">
            {t("plus.s2.you")} <Fig>{ovr}</Fig>
          </span>
        </div>
        <ul className="ps-build">
          {order.map((code, ix) => {
            const c = S.contributions[code];
            const p = c > 0;
            return (
              <li key={code}>
                <span className="nm">
                  <RatingIcon code={code} size={18} />
                  {ratingName(t, code)}
                </span>
                <span
                  className="ps-track"
                  role="img"
                  aria-label={fill("plus.s2.a_build", {
                    name: ratingName(t, code),
                    d: num(c, 0, true),
                  })}
                >
                  <s />
                  <i
                    className={`ps-fx ${p ? "p" : "n end"}`}
                    style={{ width: `${(Math.abs(c) / 6) * 50}%`, ["--i" as string]: ix }}
                  />
                </span>
                <b className={p ? "mint" : "dn"}>
                  <Fig>{num(c, 0, true)}</Fig>
                </b>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
