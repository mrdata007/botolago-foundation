import { useState } from "react";

import type { TranslationKey } from "@/i18n/dictionaries";
import type { StatCode } from "@/components/manager-card/types";

import { PlusLogoHeading } from "./PlusBits";
import { usePlusCopy } from "./plus-copy";
import { PLUS_SAMPLE, weekBest, type SamplePerson } from "./plus-sample";

function statWord(t: (key: TranslationKey) => string, code: StatCode): string {
  switch (code) {
    case "cap":
      return t("card.stat_word.cap");
    case "sel":
      return t("card.stat_word.sel");
    case "trf":
      return t("card.stat_word.trf");
    case "con":
      return t("card.stat_word.con");
  }
}
const STATS: readonly StatCode[] = ["cap", "sel", "trf", "con"];
const BAR_MAX_PX = 40;

/**
 * Screen 2, « Ta meilleure journée de la saison » (sketch `#screen-2`): one football story (points
 * per journée, the best one highlighted), one rivalry (two identities, « Toi 7–4 Sami »), the
 * statistics comparison behind « Voir le détail », then exactly three benefits.
 *
 * The time axis follows the reading direction: in Arabic the first journée is on the right
 * (deliberate, confirm with the Arabic reviewer). Each rival gets its own column with crest, name,
 * role tag and score, so « أنت 7، سامي 4 » can never read as the scores of the opposite people.
 *
 * All of it is example data until lane C serves the real reads (`plus-sample.ts`).
 */
export function PlusSeasonScreen({
  onNext,
  titleRef,
}: {
  onNext: () => void;
  titleRef: React.Ref<HTMLHeadingElement>;
}) {
  const { t, f, count, countPlain } = usePlusCopy();
  const [open, setOpen] = useState(false);
  const { me, rival, weeks, duel } = PLUS_SAMPLE;
  const best = weekBest(weeks);
  const max = Math.max(...weeks.pts);
  const jl = (n: number) => <bdi>{t("plus.s2.j_short").replace("{n}", String(n))}</bdi>;
  const jlText = (n: number) => t("plus.s2.j_short").replace("{n}", String(n));
  const diff = duel.you - duel.them;
  const resultKey: TranslationKey =
    diff > 0 ? "plus.s2.lead_w" : diff < 0 ? "plus.s2.lead_l" : "plus.s2.tie";
  const meName = t("plus.s2.me_name");
  const rivalName = t("plus.s2.rival_name");
  const last = weeks.from + weeks.pts.length - 1;

  return (
    <>
      <div className="plus-body">
        <h1 className="plus-h" id="plus-s2-title" tabIndex={-1} ref={titleRef}>
          {t("plus.s2.title")}
        </h1>

        <section className="plus-panel" aria-labelledby="plus-s2-chart-h">
          <h2 className="plus-h2 plus-sr-only" id="plus-s2-chart-h">
            {t("plus.s2.chart_title")}
          </h2>
          <p className="plus-s2-best">
            {f("plus.s2.best_line", {
              j: jl(best.journee),
              pts: <b>{count(best.pts, "points")}</b>,
            })}
          </p>
          <div
            className="plus-bars"
            role="img"
            aria-label={t("plus.s2.chart_aria")
              .replace("{from}", jlText(weeks.from))
              .replace("{to}", jlText(last))
              .replace("{j}", jlText(best.journee))
              .replace("{pts}", countPlain(best.pts, "points"))}
          >
            {weeks.pts.map((v, i) => {
              const isBest = i === best.index;
              return (
                <div className="plus-col" data-best={isBest} key={weeks.from + i}>
                  {isBest ? (
                    <span className="plus-val">
                      <bdi>{v}</bdi>
                    </span>
                  ) : null}
                  <div
                    className="plus-bar"
                    style={{ height: Math.round((v / max) * BAR_MAX_PX) }}
                  />
                  {isBest ? <span className="plus-jl">{jl(weeks.from + i)}</span> : null}
                </div>
              );
            })}
          </div>
          <ul className="plus-sr-only">
            {weeks.pts.map((v, i) => (
              <li key={weeks.from + i}>
                {`${jlText(weeks.from + i)} · ${countPlain(v, "points")}`}
              </li>
            ))}
          </ul>
        </section>

        <section className="plus-panel" aria-labelledby="plus-s2-duel-h">
          <h2 className="plus-h2 plus-sr-only" id="plus-s2-duel-h">
            {t("plus.s2.duel_title")}
          </h2>
          <p className="plus-result">
            {f(resultKey, { n: <bdi>{count(Math.abs(diff), "rounds")}</bdi> })}
          </p>
          <div className="plus-vs">
            <Side person={me} name={meName} tag={t("plus.s2.you")} score={duel.you} />
            <span className="plus-vsmark" aria-hidden>
              {t("plus.s2.vs")}
            </span>
            <Side person={rival} name={rivalName} tag={t("plus.s2.rival")} score={duel.them} />
          </div>
          <div
            className="plus-strip"
            role="img"
            aria-label={t("plus.s2.strip_aria")
              .replace("{you}", countPlain(duel.you, "rounds"))
              .replace("{them}", countPlain(duel.them, "rounds"))
              .replace("{name}", rivalName)}
          >
            {duel.strip.split("").map((c, i) => (
              <i key={i} data-won={c === "w"} />
            ))}
          </div>
          <p className="plus-small plus-stripcap">{t("plus.s2.strip_cap")}</p>
          <div className="plus-more">
            <button
              type="button"
              className="plus-btn plus-btn--text plus-more-btn"
              aria-expanded={open}
              aria-controls="plus-s2-detail"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? t("plus.s2.detail_close") : t("plus.s2.detail_open")}
            </button>
            <div className="plus-detail" id="plus-s2-detail" hidden={!open}>
              <table className="plus-table">
                <caption className="plus-sr-only">
                  {t("plus.s2.detail_caption").replace("{name}", rivalName)}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="plus-sr-only">{t("plus.s2.col_stat")}</span>
                    </th>
                    <th scope="col">{t("plus.s2.you")}</th>
                    <th scope="col">{rivalName}</th>
                  </tr>
                </thead>
                <tbody>
                  {STATS.map((code) => {
                    const a = me.stats[code];
                    const b = rival.stats[code];
                    return (
                      <tr key={code}>
                        <th scope="row">{statWord(t, code)}</th>
                        <td data-lead={a >= b}>
                          <bdi>{a}</bdi>
                        </td>
                        <td data-lead={b > a}>
                          <bdi>{b}</bdi>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="plus-s2-ben" aria-labelledby="plus-s2-ben-h">
          <PlusLogoHeading id="plus-s2-ben-h" templateKey="plus.with" />
          <ul className="plus-benefits">
            {[t("plus.s2.benefit1"), t("plus.s2.benefit2"), t("plus.s2.benefit3")].map((line) => (
              <li key={line}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="plus-foot">
        <button type="button" className="plus-btn plus-btn--primary" onClick={onNext}>
          {t("plus.s2.cta")}
        </button>
      </div>
    </>
  );
}

function Side({
  person,
  name,
  tag,
  score,
}: {
  person: SamplePerson;
  name: string;
  tag: string;
  score: number;
}) {
  const { t } = usePlusCopy();
  return (
    <div className="plus-col2" style={{ ["--club" as string]: person.accent }}>
      <div className="plus-id">
        <span className="plus-crest" aria-hidden>
          <bdi dir="ltr">{person.clubShort}</bdi>
        </span>
        <span className="plus-idt">
          <b>
            <bdi>{name}</bdi>
          </b>
          <span>{tag}</span>
        </span>
      </div>
      <p className="plus-score">
        <b>
          <bdi dir="ltr">{score}</bdi>
        </b>
        <span>{t("plus.s2.won_label")}</span>
      </p>
    </div>
  );
}
