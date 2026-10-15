import { Eye, Lock, MessageCircle, UserMinus } from "lucide-react";
import { useId, useMemo } from "react";

import { ShareImageSheet } from "@/components/common/ShareImageSheet";
import { initialsOf, roundVerdict, weekResult, type Rival } from "@/backend/premium/rivals";
import { fillText } from "@/components/manager-card/interpolate";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { PlusLogo } from "./PlusLogo";
import { PLUS_NAME, usePlusCopy } from "./plus-copy";
import { renderRivalImage, type RivalImageModel } from "./plus-rivals-image";
import { bilanText, gapLine, shareMessage, stampText, formatDay } from "./plus-rivals-text";

/** A seeded pseudo-random sequence: the crowd is the same on every poster and every render. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

interface Shape {
  kind: "head" | "body" | "flag";
  x: number;
  y: number;
  a: number;
  b?: number;
}

/** Two rows of supporters and a few flags: decoration under the poster, drawn once. */
const CROWD: { alpha: number; shapes: Shape[] }[] = [0, 1].map((row) => {
  const random = seeded(11 + row);
  const shapes: Shape[] = [];
  for (let x = -8 + row * 8; x < 380; x += 15 + random() * 5) {
    const r = 5.4 + random() * 2.6;
    const y = (row === 0 ? 33 : 46) + random() * 4;
    shapes.push({ kind: "head", x, y, a: r });
    shapes.push({ kind: "body", x: x - r * 1.7, y: y + r * 0.9, a: r * 3.4, b: 40 });
    if (random() > 0.84)
      shapes.push({ kind: "flag", x: x + r, y: y - 26 - random() * 8, a: 2.4, b: 26 });
  }
  return { alpha: row === 0 ? 0.55 : 1, shapes };
});

/** The foot of a poster: a stand of supporters under a floodlight haze. */
export function PlusCrowd() {
  const id = `prhaze${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      className="pr-crowd"
      viewBox="0 0 360 64"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fd6ff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#9ff0c4" stopOpacity="0.22" />
          <stop offset="1" stopColor="#7fd6ff" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect width="360" height="64" fill={`url(#${id})`} />
      {CROWD.map((row, i) => (
        <g key={i} opacity={row.alpha}>
          {row.shapes.map((s, j) =>
            s.kind === "head" ? (
              <circle key={j} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={s.a.toFixed(1)} />
            ) : s.kind === "body" ? (
              <rect
                key={j}
                x={s.x.toFixed(1)}
                y={s.y.toFixed(1)}
                width={s.a.toFixed(1)}
                height={s.b}
                rx={(s.a * 0.4).toFixed(1)}
              />
            ) : (
              <rect
                key={j}
                x={s.x.toFixed(1)}
                y={s.y.toFixed(1)}
                width={s.a}
                height={s.b}
                rx="1.2"
              />
            ),
          )}
        </g>
      ))}
    </svg>
  );
}

/** The round avatar: initials in a ring (decoration; the name is written under it). */
export function PlusInitials({
  name,
  tone,
  small = false,
}: {
  name: string;
  tone: "me" | "rival";
  small?: boolean;
}) {
  return (
    <span
      className={cn("pr-ini", tone === "rival" && "pr-ini--rival", small && "pr-ini--small")}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * One rival as a matchday poster: you and them facing each other with the last published journée's
 * score between you, the totals and the tally under it, a published stamp, and what the friend
 * chose to share (captain, last transfer). The same poster, drawn on a canvas, is the WhatsApp
 * picture (`plus-rivals-image.ts`). Nothing here is a rating: a transfer whose result is not
 * evaluable yet reads « en attente », never a number.
 */
export function PlusRivalPoster({
  rival,
  meName,
  index = 0,
  example = false,
  onUnpin,
  busy = false,
  posterId,
}: {
  rival: Rival;
  meName: string;
  index?: number;
  /** Under the locked blur: no actions at all. */
  example?: boolean;
  onUnpin?: (rival: Rival) => void;
  busy?: boolean;
  posterId?: string;
}) {
  const { t, f, text, lang } = usePlusCopy();
  const { t: translate } = useI18n();
  const last = rival.last;
  const verdict = roundVerdict(last);
  const lead = last?.leader === "me" ? "me" : last?.leader === "rival" ? "rival" : null;
  const stamp = stampText(translate, lang, rival);
  const gap = gapLine(translate, rival);
  const bilan = bilanText(translate, lang, rival.tally);
  const big = rival.biggestWin;
  const captain = rival.captain;
  const hasCaptain = captain !== null && (captain.me !== null || captain.rival !== null);

  const verdictText = useMemo(() => {
    if (!last || last.me === null || last.rival === null || verdict === null) return null;
    if (verdict === "won")
      return text("plus.rv.verdict_won", { n: last.seq, a: last.me, b: last.rival });
    if (verdict === "lost")
      return text("plus.rv.verdict_lost", {
        n: last.seq,
        name: rival.name,
        a: last.rival,
        b: last.me,
      });
    return text("plus.rv.verdict_level", { n: last.seq, a: last.me, b: last.rival });
  }, [last, verdict, text, rival.name]);

  const imageModel = (): RivalImageModel => ({
    lang,
    leagueName: rival.league.name,
    stamp: stamp ?? "",
    meName,
    rivalName: rival.name,
    meInitials: initialsOf(meName),
    rivalInitials: initialsOf(rival.name),
    meScore: String(last?.me ?? ""),
    rivalScore: String(last?.rival ?? ""),
    verdict: verdictText ?? "",
    totalLabel: t("plus.rv.total"),
    meTotal: String(last?.meTotal ?? ""),
    rivalTotal: String(last?.rivalTotal ?? ""),
    gap,
    bilan,
    leader: last?.leader ?? null,
  });

  const shareable = !example && last !== null && last.me !== null && last.rival !== null;

  return (
    <article
      className={cn(
        "pr-poster",
        lead === "me" && "pr-lead-me",
        lead === "rival" && "pr-lead-rival",
      )}
      style={{ ["--i" as string]: index }}
      id={posterId}
      aria-label={`${meName} – ${rival.name}`}
      data-testid={example ? undefined : "plus-rival-poster"}
    >
      <div className="pr-split" aria-hidden="true" />
      <div className="pr-glow" aria-hidden="true" />
      <header className="pr-top">
        <PlusLogo label={PLUS_NAME} height={16} />
        {stamp ? <span className="pr-stamp">{stamp}</span> : null}
      </header>

      <div
        className="pr-face"
        role="group"
        aria-label={
          last && last.me !== null && last.rival !== null ? `${last.me} – ${last.rival}` : undefined
        }
      >
        <PlusInitials name={meName} tone="me" />
        <div className="pr-score" dir="ltr">
          {last && last.me !== null && last.rival !== null ? (
            <>
              <span className="pr-sc-me">{last.me}</span>
              <i aria-hidden="true">–</i>
              <span className="pr-sc-rival">{last.rival}</span>
            </>
          ) : null}
        </div>
        <PlusInitials name={rival.name} tone="rival" />
      </div>
      <div className="pr-names">
        <b className="pr-name">
          <bdi>{meName}</bdi>
        </b>
        <b className="pr-name">
          <bdi>{rival.name}</bdi>
        </b>
      </div>
      {verdictText ? <p className="pr-verdict">{verdictText}</p> : null}

      <div className="pr-glass">
        {last && last.meTotal !== null && last.rivalTotal !== null ? (
          <div className="pr-total">
            <span className="pr-total-l">{t("plus.rv.total")}</span>
            <span className="pr-total-n" dir="ltr">
              <b className="pr-m">{last.meTotal}</b>
              <i>–</i>
              <b className="pr-h">{last.rivalTotal}</b>
            </span>
            {gap ? <span className="pr-total-g">{gap}</span> : null}
          </div>
        ) : null}
        {rival.weeks.length > 0 ? (
          <ol className="pr-tally" role="img" aria-label={bilan}>
            {rival.weeks.map((week) => {
              const r = weekResult(week);
              return (
                <li key={week.seq} className={r ? `pr-t-${r}` : "pr-t-none"}>
                  <span>{week.seq}</span>
                </li>
              );
            })}
          </ol>
        ) : null}
        <p className="pr-bilan">{bilan}</p>
        {big ? (
          <p className="pr-fine">
            {f("plus.rv.big_gap", {
              margin: <bdi dir="ltr">{`+${big.margin}`}</bdi>,
              n: big.seq,
              a: <bdi dir="ltr">{big.me}</bdi>,
              b: <bdi dir="ltr">{big.rival}</bdi>,
            })}
          </p>
        ) : null}
        {last?.correctedAt ? (
          <p className="pr-fine">
            {text("plus.rv.corrected", { date: formatDay(lang, last.correctedAt) })}
          </p>
        ) : null}

        {rival.historyVisible ? (
          <>
            {hasCaptain && last ? (
              <div className="pr-caps">
                <p className="pr-caps-l">{text("plus.rv.captains", { n: last.seq })}</p>
                <div className="pr-caps-row">
                  {captain?.me?.name ? (
                    <span className="pr-cap-me">
                      <bdi>{captain.me.name}</bdi>{" "}
                      {captain.me.points !== null ? (
                        <b>{text("plus.rv.pts", { n: captain.me.points })}</b>
                      ) : null}
                    </span>
                  ) : null}
                  {captain?.me?.name && captain?.rival?.name ? (
                    <span aria-hidden="true">·</span>
                  ) : null}
                  {captain?.rival?.name ? (
                    <span className="pr-cap-rival">
                      <bdi>{captain.rival.name}</bdi>{" "}
                      {captain.rival.points !== null ? (
                        <b>{text("plus.rv.pts", { n: captain.rival.points })}</b>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {rival.transfer ? (
              <p className="pr-transfer">
                <span>
                  {f("plus.rv.transfer", {
                    name: <bdi>{rival.name}</bdi>,
                    player: <bdi>{rival.transfer.playerIn}</bdi>,
                  })}
                </span>
                {rival.transfer.pending || rival.transfer.gain === null ? (
                  <em className="pr-pending">{t("plus.rv.pending")}</em>
                ) : (
                  <b dir="ltr">
                    {rival.transfer.gain > 0
                      ? `+${rival.transfer.gain}`
                      : String(rival.transfer.gain)}
                  </b>
                )}
              </p>
            ) : null}
            <p className="pr-chip pr-chip--open">
              <Eye aria-hidden />
              <span>{f("plus.rv.shared", { name: <bdi>{rival.name}</bdi> })}</span>
            </p>
          </>
        ) : (
          <p className="pr-chip pr-chip--lock">
            <Lock aria-hidden />
            <span>{f("plus.rv.private", { name: <bdi>{rival.name}</bdi> })}</span>
          </p>
        )}
      </div>

      {shareable ? (
        <ShareImageSheet
          label={t("plus.rv.share")}
          campaign="rivals"
          testIdPrefix="rivals"
          testId="plus-rival-share"
          aspect="post"
          fileName={`botolago-rivaux-j${last.seq}.png`}
          imageAlt={text("plus.rv.img_alt", { me: meName, name: rival.name, n: last.seq })}
          renderKey={`${rival.teamId}:${last.seq}:${last.correctedAt ?? ""}:${last.meTotal}:${last.rivalTotal}:${lang}`}
          message={shareMessage(translate, rival)}
          path="/curva"
          render={() => renderRivalImage(imageModel())}
          trigger={(open) => (
            <button type="button" className="pr-btn pr-btn--wa" onClick={open}>
              <MessageCircle aria-hidden />
              <span>{t("plus.rv.share")}</span>
            </button>
          )}
        />
      ) : null}
      {!example && onUnpin ? (
        <button
          type="button"
          className="pr-btn pr-btn--quiet"
          disabled={busy}
          onClick={() => onUnpin(rival)}
          data-testid="plus-rival-remove"
        >
          <UserMinus aria-hidden />
          <span>{fillText(translate("plus.rv.remove"), { name: rival.name })}</span>
        </button>
      ) : null}
      <PlusCrowd />
    </article>
  );
}
