import { useId, type CSSProperties, type ReactNode } from "react";

import { JOURNEES, SEASON, SEASON_RAW } from "./plus-season-data";

/**
 * The season's charts: React and inline SVG, drawn to scale from `plus-season-data.ts` (never
 * from typed numbers). One viewBox width (300) so a phone shows them at 1:1 or larger and the
 * 13 px labels stay above 12 px. Time axes run left to right in every language (the SVG is
 * `direction: ltr` in `plus-season.css`): J.1 is on the left in Arabic too.
 *
 * Motion is in CSS (`plus-season.css`): `.draw` lines (stroke-dashoffset), `.gb` bars growing from
 * their baseline (transform), `.fade` values and dots (opacity). Every element is in its final
 * state at rest and under `prefers-reduced-motion`.
 */
export const CHART_W = 300;
const W = CHART_W;
const J = JOURNEES;
const f1 = (v: number) => String(+v.toFixed(1));
const pts = (xs: number[], ys: number[]) => xs.map((x, i) => `${f1(x)},${f1(ys[i]!)}`);
const pathOf = (p: string[]) => `M${p.join(" L")}`;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const JL = Array.from({ length: J }, (_, i) => i + 1);

function Grid({
  Y,
  ticks,
  L0 = 28,
  R0 = 4,
  fmt = String,
}: {
  Y: (v: number) => number;
  ticks: number[];
  L0?: number;
  R0?: number;
  fmt?: (v: number) => string;
}) {
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line
            className={`grid${t === 0 ? " zero" : ""}`}
            x1={L0}
            x2={W - R0}
            y1={f1(Y(t))}
            y2={f1(Y(t))}
          />
          <text className="ax" x={L0 - 6} y={f1(Y(t) + 4)} textAnchor="end">
            {fmt(t)}
          </text>
        </g>
      ))}
    </>
  );
}

function XLabels({
  X,
  y,
  labels,
}: {
  X: (i: number) => number;
  y: number;
  labels: readonly string[];
}) {
  return (
    <>
      {labels.map((l, i) =>
        l ? (
          <text className="ax" key={i} x={f1(X(i))} y={y} textAnchor="middle">
            {l}
          </text>
        ) : null,
      )}
    </>
  );
}

/** A line that draws itself (`pathLength` 1, offset 1 to 0). */
function Draw({ d, className }: { d: string; className: string }) {
  return <path d={d} pathLength={1} className={`draw ${className}`} />;
}

/** A dashed line that draws itself: the dashes are the line, a solid mask is what draws. */
function DashedDraw({ d, className }: { d: string; className: string }) {
  const id = useId();
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height="400">
        <path d={d} pathLength={1} className="draw mk" fill="none" stroke="#fff" strokeWidth="8" />
      </mask>
      <path d={d} className={className} mask={`url(#${id})`} />
    </>
  );
}

/** A bar growing from its baseline (`oy`, in viewBox units). */
function Bar({
  x,
  y,
  w,
  h,
  cls,
  i,
  oy,
  delay,
  fill,
  stroke,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  cls: string;
  i: number;
  oy: number;
  delay?: number;
  fill?: string;
  stroke?: string;
}) {
  return (
    <rect
      className={`gb ${cls}`}
      style={
        {
          "--i": i,
          "--oy": `${f1(oy)}px`,
          ...(delay ? { "--d": `${delay}ms` } : {}),
        } as CSSProperties
      }
      x={f1(x)}
      y={f1(y)}
      width={w}
      height={f1(Math.max(h, 0))}
      rx={4}
      fill={fill}
      stroke={stroke}
    />
  );
}

function Svg({ h, label, children }: { h: number; label: string; children: ReactNode }) {
  return (
    <svg className="ps-chart" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** An end dot with a soft halo. */
function EndDot({ x, y, cls, r = 4.5 }: { x: number; y: number; cls: string; r?: number }) {
  return (
    <>
      <circle className={`fade halo ${cls}`} cx={f1(x)} cy={f1(y)} r={r + 5} />
      <circle className={`fade dot ${cls}`} cx={f1(x)} cy={f1(y)} r={r} />
    </>
  );
}

/* ------------------------------------------------------------------ cumulative */

/** Two cumulative lines (you and a reference), the lead shaded between them, the totals at the end. */
export function CumChart({
  a,
  b,
  bKind,
  label,
  jAxis,
}: {
  a: readonly number[];
  b: readonly number[];
  bKind: "ref" | "rival";
  label: string;
  jAxis: (n: number) => string;
}) {
  const id = useId();
  const H = 220;
  const T = 14;
  const B = H - 26;
  const L0 = 28;
  const R0 = 40;
  const X = (i: number) => L0 + ((W - L0 - R0) * i) / (J - 1);
  const Y = (v: number) => T + (B - T) * (1 - v / 650);
  const xs = a.map((_, i) => X(i));
  const pa = pts(xs, a.map(Y));
  const pb = pts(xs, b.map(Y));
  const area = `M${pa.join(" L")} L${[...pb].reverse().join(" L")} Z`;
  const last = J - 1;
  return (
    <Svg h={H} label={label}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--po-mint)" stopOpacity=".34" />
          <stop offset="1" stopColor="var(--po-mint)" stopOpacity=".04" />
        </linearGradient>
      </defs>
      <Grid Y={Y} ticks={[0, 300, 600]} R0={R0 - 34} />
      <path className="fade" d={area} fill={`url(#${id}s)`} />
      {bKind === "ref" ? (
        <DashedDraw d={pathOf(pb)} className="l-ref" />
      ) : (
        <Draw d={pathOf(pb)} className="l-rival" />
      )}
      <Draw d={pathOf(pa)} className="l-you" />
      <circle className="pulse-ring" cx={f1(X(last))} cy={f1(Y(a[last]!))} r={6} />
      <EndDot x={X(last)} y={Y(a[last]!)} cls="you" />
      <EndDot x={X(last)} y={Y(b[last]!)} cls={bKind === "ref" ? "ref" : "rival"} r={3.5} />
      <text className="end you fade" x={f1(X(last) + 11)} y={f1(Y(a[last]!) - 4)}>
        {a[last]}
      </text>
      <text className={`end ${bKind} fade`} x={f1(X(last) + 11)} y={f1(Y(b[last]!) + 15)}>
        {b[last]}
      </text>
      <XLabels X={X} y={H - 6} labels={JL.map((n) => (n === 1 ? jAxis(1) : String(n)))} />
    </Svg>
  );
}

/* --------------------------------------------------------------- points per journée */

/** Your points per journée against the league average line, the best journée picked out. */
export function PointsBars({ label, jAxis }: { label: string; jAxis: (n: number) => string }) {
  const you = SEASON_RAW.you;
  const avg = SEASON_RAW.leagueAvg;
  const H = 208;
  const T = 18;
  const B = 172;
  const L0 = 28;
  const R0 = 4;
  const cw = (W - L0 - R0) / J;
  const bw = 16;
  const Y = (v: number) => T + (B - T) * (1 - v / 100);
  const X = (i: number) => L0 + cw * (i + 0.5);
  const best = SEASON.bestWeek;
  return (
    <Svg h={H} label={label}>
      <Grid Y={Y} ticks={[0, 50, 100]} R0={R0} />
      {you.map((v, i) => (
        <Bar
          key={i}
          x={X(i) - bw / 2}
          y={Y(v)}
          w={bw}
          h={B - Y(v)}
          cls={i === best ? "b-best" : v >= avg[i]! ? "b-up" : "b-dn"}
          i={i}
          oy={B}
        />
      ))}
      <DashedDraw
        d={pathOf(
          pts(
            avg.map((_, i) => X(i)),
            avg.map(Y),
          ),
        )}
        className="l-avg"
      />
      {you.map((v, i) => (
        <text
          key={i}
          className={`val fade${i === best ? " best" : ""}`}
          x={f1(X(i))}
          y={f1(Y(Math.max(v, avg[i]!)) - 7)}
          textAnchor="middle"
        >
          {v}
        </text>
      ))}
      <XLabels X={X} y={H - 6} labels={JL.map((n) => (n === 1 ? jAxis(1) : String(n)))} />
    </Svg>
  );
}

/* ------------------------------------------------------------------ signed bars */

/** Bars above and below a zero line, one per column; the sign picks the colour. */
export function SignedBars({
  vals,
  labels,
  min,
  max,
  ticks,
  label,
  H = 176,
  bw = 16,
}: {
  vals: readonly number[];
  labels: readonly string[];
  min: number;
  max: number;
  ticks: number[];
  label: string;
  H?: number;
  bw?: number;
}) {
  const T = 22;
  const B = H - 28;
  const L0 = 28;
  const R0 = 4;
  const n = vals.length;
  const cw = (W - L0 - R0) / n;
  const Y = (v: number) => T + ((B - T) * (max - v)) / (max - min);
  const X = (i: number) => L0 + cw * (i + 0.5);
  const y0 = Y(0);
  return (
    <Svg h={H} label={label}>
      <Grid Y={Y} ticks={ticks} R0={R0} fmt={signed} />
      {vals.map((v, i) => {
        const pos = v >= 0;
        return (
          <g key={i}>
            <Bar
              x={X(i) - bw / 2}
              y={pos ? Y(v) : y0}
              w={bw}
              h={Math.max(Math.abs(Y(v) - y0), 2)}
              cls={pos ? "g-up" : "g-dn"}
              i={i}
              oy={y0}
            />
            <text
              className={`val fade ${pos ? "mint" : "neg"}`}
              x={f1(X(i))}
              y={f1(pos ? Y(v) - 6 : Y(v) + 16)}
              textAnchor="middle"
            >
              {signed(v)}
            </text>
          </g>
        );
      })}
      <XLabels X={X} y={H - 6} labels={labels} />
    </Svg>
  );
}

/* -------------------------------------------------------------------- captain */

/** The captain's points per journée, and what the best starter would have added on top (hatched). */
export function CaptainChart({ label, jAxis }: { label: string; jAxis: (n: number) => string }) {
  const hatch = useId();
  const cap = SEASON_RAW.captain;
  const best = SEASON_RAW.bestStarter;
  const H = 168;
  const T = 16;
  const B = 130;
  const L0 = 28;
  const R0 = 4;
  const cw = (W - L0 - R0) / J;
  const bw = 16;
  const Y = (v: number) => T + (B - T) * (1 - v / 20);
  const X = (i: number) => L0 + cw * (i + 0.5);
  return (
    <Svg h={H} label={label}>
      <defs>
        <pattern
          id={hatch}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--po-sky)" strokeWidth="2" />
        </pattern>
      </defs>
      <Grid Y={Y} ticks={[0, 10, 20]} R0={R0} />
      {cap.map((c, i) => {
        const left = best[i]! - c;
        return (
          <g key={i}>
            <Bar x={X(i) - bw / 2} y={Y(c)} w={bw} h={B - Y(c)} cls="b-cap" i={i} oy={B} />
            {left > 0 ? (
              <>
                <Bar
                  x={X(i) - bw / 2}
                  y={Y(best[i]!)}
                  w={bw}
                  h={Y(c) - Y(best[i]!)}
                  cls="b-left"
                  i={i}
                  oy={Y(c)}
                  delay={260}
                  fill={`url(#${hatch})`}
                  stroke="var(--po-sky)"
                />
                {left >= 4 ? (
                  <text
                    className="val fade sky"
                    x={f1(X(i))}
                    y={f1(Y(best[i]!) - 6)}
                    textAnchor="middle"
                  >
                    {signed(-left)}
                  </text>
                ) : null}
              </>
            ) : null}
          </g>
        );
      })}
      <XLabels X={X} y={H - 6} labels={JL.map((n) => (n === 1 ? jAxis(1) : String(n)))} />
    </Svg>
  );
}

/* ----------------------------------------------------------------- cumulative lead */

/** Your cumulative lead over the rival after each journée; the first lead, the peak and the end are named. */
export function LeadChart({ label, jAxis }: { label: string; jAxis: (n: number) => string }) {
  const id = useId();
  const lead = SEASON.cumLead;
  const H = 168;
  const T = 26;
  const B = 136;
  const L0 = 28;
  const R0 = 12;
  const X = (i: number) => L0 + 8 + ((W - L0 - R0 - 8) * i) / (J - 1);
  const Y = (v: number) => T + ((B - T) * (18 - v)) / 20;
  const p = pts(
    lead.map((_, i) => X(i)),
    lead.map(Y),
  );
  const first = lead.findIndex((v, i) => i > 0 && v > 0 && lead[i - 1]! <= 0);
  const peak = SEASON.peakLeadWeek;
  const last = J - 1;
  const hot = new Map<number, "start" | "middle" | "end">([
    [first, "start"],
    [peak, "middle"],
    [last, "end"],
  ]);
  return (
    <Svg h={H} label={label}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--po-mint)" stopOpacity=".32" />
          <stop offset="1" stopColor="var(--po-mint)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <Grid Y={Y} ticks={[0, 10]} L0={L0} R0={R0} fmt={signed} />
      <path
        className="fade"
        fill={`url(#${id})`}
        d={`M${f1(X(0))},${f1(Y(0))} L${p.join(" L")} L${f1(X(last))},${f1(Y(0))} Z`}
      />
      <Draw d={pathOf(p)} className="l-lead" />
      {lead.map((v, i) =>
        hot.has(i) ? (
          <g key={i}>
            <EndDot x={X(i)} y={Y(v)} cls="you" r={4} />
            <text
              className="val fade mint"
              x={f1(X(i) + (hot.get(i) === "start" ? 2 : 0))}
              y={f1(Y(v) + (hot.get(i) === "start" ? 22 : -12))}
              textAnchor={hot.get(i)}
            >
              {signed(v)}
            </text>
          </g>
        ) : null,
      )}
      <XLabels X={X} y={H - 6} labels={JL.map((n) => (n === 1 ? jAxis(1) : String(n)))} />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- OVR */

/** The OVR over the journées against the league's (dashed). */
export function OvrChart({ label, jAxis }: { label: string; jAxis: (n: number) => string }) {
  const id = useId();
  const ovr = SEASON.ovrSeries;
  const h = 132;
  const lo = 55;
  const hi = 80;
  const px = 28;
  const py = 10;
  const R0 = 10;
  const X = (i: number) => px + ((W - px - R0) * i) / (J - 1);
  const Y = (v: number) => h - 22 - ((h - 22 - py) * (v - lo)) / (hi - lo);
  const d = ovr.map((v, i) => `${i ? "L" : "M"}${f1(X(i))} ${f1(Y(v))}`).join(" ");
  const ya = f1(Y(SEASON.leagueOvrExact));
  return (
    <Svg h={h} label={label}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--po-mint)" stopOpacity=".26" />
          <stop offset="1" stopColor="var(--po-mint)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <Grid Y={Y} ticks={[60, 70, 80]} L0={px} R0={R0} />
      <path
        className="fade"
        fill={`url(#${id})`}
        d={`${d} L${f1(X(J - 1))} ${h - 22} L${px} ${h - 22} Z`}
      />
      <DashedDraw d={`M${px} ${ya} L${W - R0} ${ya}`} className="l-ref" />
      <Draw d={d} className="l-you" />
      <EndDot x={X(J - 1)} y={Y(ovr[J - 1]!)} cls="you" r={5} />
      <XLabels
        X={X}
        y={h - 4}
        labels={JL.map((n) => (n === 1 ? jAxis(1) : n === 6 || n === J ? String(n) : ""))}
      />
    </Svg>
  );
}

/** A small trend line for one rating, with the league's value as a dashed rule. */
export function Spark({
  vals,
  avg,
  w = 104,
  h = 40,
}: {
  vals: readonly (number | null)[];
  avg: number;
  w?: number;
  h?: number;
}) {
  const lo = 45;
  const hi = 90;
  const pad = 5;
  const n = vals.length;
  const X = (i: number) => pad + ((w - 2 * pad) * i) / (n - 1);
  const Y = (v: number) => h - pad - ((h - 2 * pad) * (v - lo)) / (hi - lo);
  const pp = vals.flatMap((v, i) => (v === null ? [] : [[i, v] as const]));
  const d = pp.map(([i, v], k) => `${k ? "L" : "M"}${f1(X(i))} ${f1(Y(v))}`).join(" ");
  const [li, lv] = pp[pp.length - 1]!;
  return (
    <svg className="ps-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <line
        className="grid"
        x1={pad}
        x2={w - pad}
        y1={f1(Y(avg))}
        y2={f1(Y(avg))}
        strokeDasharray="3 3"
      />
      <Draw d={d} className="l-spark" />
      <circle className="fade dot you" cx={f1(X(li))} cy={f1(Y(lv))} r={3.2} />
    </svg>
  );
}
