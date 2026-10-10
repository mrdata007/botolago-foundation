import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { prefersReducedMotion } from "@/lib/motion";

import { FOIL } from "../tier-palette";
import { useCardRenderer } from "../use-card-renderer";
import type { BeatName, TierCode } from "../types";
import { BURST_MS, burstShouldStart, burstSpec } from "./burst";
import "./tier-burst.css";

/**
 * The tier-up ceremony (the hero's `tier_up`): stadium-light beams open behind the card and fade.
 * Plain DOM in the hero's frame, behind the card (`z-index: -1` inside the card's own stacking
 * context), outside its SVG and its tilt tree, opacity and scale only (`tier-burst.css`). It starts
 * with the hero's `tier` or `legend` beat, once the card is drawn, and is gone after 1.2 s. It is
 * symmetric about the vertical axis, so Arabic mirrors nothing. Under reduced motion, or with the
 * page hidden, it is never drawn.
 */
export function TierBurst({ tier, beat }: { tier: TierCode | null; beat: BeatName | undefined }) {
  const spec = useMemo(() => burstSpec(tier), [tier]);
  const renderer = useCardRenderer();
  const [running, setRunning] = useState(false);
  const played = useRef(false);

  const ready = renderer !== null;
  useEffect(() => {
    const start = burstShouldStart({
      spec,
      beat,
      rendererReady: ready,
      reducedMotion: prefersReducedMotion(),
      hidden: document.hidden,
      alreadyPlayed: played.current,
    });
    if (!start) return;
    played.current = true;
    setRunning(true);
    // Not cleared by the effect's cleanup: a development render runs effects twice, and the beat is
    // dropped (re-running this effect) after 600 ms. Setting state after an unmount does nothing.
    window.setTimeout(() => setRunning(false), BURST_MS + 60);
  }, [spec, beat, ready]);
  if (!spec || !running) return null;
  const foil = FOIL[spec.tier];
  const period = 360 / spec.rays;
  const fill = spec.prism
    ? `conic-gradient(from 0deg, ${[...(foil.foil ?? []), foil.foil?.[0] ?? foil.light].join(", ")})`
    : (foil.beamCol ?? foil.light);
  const style = {
    "--burst-ms": `${BURST_MS}ms`,
    "--burst-peak": spec.peak,
    "--burst-reach": spec.reach,
    "--burst-period": `${period}deg`,
    "--burst-fill": fill,
    "--burst-glow": foil.glow,
  } as CSSProperties;
  return (
    <div
      aria-hidden
      data-tier-burst={spec.tier}
      data-burst-peak={spec.peak}
      className="mc-burst"
      style={style}
    >
      <span className="mc-burst__glow" />
      <span className="mc-burst__rays" />
    </div>
  );
}
