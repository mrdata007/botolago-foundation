import colorMark from "@/assets/brand/botolago-mark-color.svg";
import { APP_SHORT_URL } from "@/lib/app-download";
import { cn } from "@/lib/utils";

import { drawQr } from "./qr";

// The address never changes, so the code is worked out once per load.
const QR = drawQr(APP_SHORT_URL);
const SIDE = QR.size + QR.quiet * 2;

/**
 * The code a visitor on a computer scans with their phone. Navy modules on
 * the white plate (the plate stays light in the dark theme too, like the
 * score plate), the GO mark in the cleared middle, rounded corner patterns.
 * It assembles once, sweeping in from the reading side (`qr-sweep`).
 *
 * `label` names it for assistive technology: what it is and where it leads.
 */
export function QrCode({ label, className }: { label: string; className?: string }) {
  const { window: win } = QR;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${SIDE} ${SIDE}`}
      className={cn("qr-sweep block h-auto w-full", className)}
    >
      <rect width={SIDE} height={SIDE} fill="var(--ui-scorebox)" />
      <g fill="var(--ui-ink-deep)">
        <path d={QR.path} shapeRendering="crispEdges" />
        {QR.finders.map(([fx, fy]) => (
          <g key={`${fx}-${fy}`} transform={`translate(${fx + QR.quiet} ${fy + QR.quiet})`}>
            <path
              fillRule="evenodd"
              d="M1.75 0h3.5A1.75 1.75 0 0 1 7 1.75v3.5A1.75 1.75 0 0 1 5.25 7h-3.5A1.75 1.75 0 0 1 0 5.25v-3.5A1.75 1.75 0 0 1 1.75 0zM1.9 1h3.2A.9.9 0 0 1 6 1.9v3.2a.9.9 0 0 1-.9.9H1.9a.9.9 0 0 1-.9-.9V1.9a.9.9 0 0 1 .9-.9z"
            />
            <rect x={2} y={2} width={3} height={3} rx={0.85} />
          </g>
        ))}
      </g>
      <image
        href={colorMark}
        x={win.x + QR.quiet + 0.5}
        y={win.y + QR.quiet + 0.5}
        width={win.w - 1}
        height={win.h - 1}
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}
