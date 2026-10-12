import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { CardBack } from "@/components/curva/CardBack";
import { useI18n } from "@/i18n/provider";
import { prefersReducedMotion } from "@/lib/motion";

import { ManagerCard } from "../ManagerCard";
import { CardGlint, type GlintHandle } from "../motion/CardGlint";
import { TierWord } from "../tier-word";
import type { BeatName, CardProfile, TierCode } from "../types";
import { useCardPalette } from "../use-card-palette";
import { useCardRenderer } from "../use-card-renderer";
import { burstSpec } from "./burst";
import { BurstLayer } from "./TierBurst";
import {
  BURST_RUN_MS,
  CEREMONY_MS,
  FADE_AT_MS,
  IMPACT_MS,
  SPIN_MS,
  STAMP_AT_MS,
  STAMP_MS,
  FADE_IN_MS,
  dimFrames,
  fadeInFrames,
  spinFrames,
  stampFrames,
  stampOutFrames,
  thudFrames,
} from "./ceremony";
import "./tier-burst.css";
import "./ceremony.css";

/**
 * The card of a `tier_up` hero, with its ceremony (`ceremony.ts` has the timeline): the page dims to
 * a spotlight, the card flies in spinning once and lands with an impact, the ground shadow thuds,
 * the burst of light opens over the dim, a band of light crosses the card (LEGEND's is a full rainbow
 * foil sweep), and the tier badge stamps onto its lower edge. About 1.5 s, and a tap anywhere or
 * Escape ends it at once. It starts when the card is drawn (the renderer's chunk has loaded), once.
 *
 * Everything moves on wrappers outside the card's SVG and its tilt tree: transform and opacity, on
 * the compositor. The 3D (a perspective on the stage, `preserve-3d` on the spinner, and the back of
 * the card as the face the spin shows halfway) exists only while it runs, and the card's own tilt is
 * off until it has ended. Under reduced motion, with the page hidden or without the Web Animations
 * API nothing of this is drawn: the card is the ordinary hero card and its beat plays at once.
 *
 * The hero's own beat (the card's shine) is held until the impact, so the card lights as it lands.
 */
export function TierCeremonyCard({
  profile,
  beat,
  tier,
}: {
  profile: CardProfile;
  beat: BeatName | undefined;
  tier: TierCode;
}) {
  const spec = useMemo(() => burstSpec(tier), [tier]);
  const renderer = useCardRenderer();
  const palette = useCardPalette(tier);
  const { dir } = useI18n();
  const rtl = dir === "rtl";
  const [phase, setPhase] = useState<"wait" | "run" | "done">("wait");
  const [impact, setImpact] = useState(false);
  const [spot, setSpot] = useState<string | undefined>(undefined);
  const wrap = useRef<HTMLDivElement | null>(null);
  const spin = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const dim = useRef<HTMLDivElement | null>(null);
  const ground = useRef<HTMLSpanElement | null>(null);
  const stamp = useRef<HTMLSpanElement | null>(null);
  const glint = useRef<GlintHandle | null>(null);
  const run = useRef<{ end: () => void } | null>(null);

  // The card is drawn (its renderer has loaded): decide, before the first painted frame of it,
  // whether the ceremony runs, so a card that is going to spin is never seen standing still first.
  const ready = renderer !== null;
  useLayoutEffect(() => {
    if (phase !== "wait" || !ready) return;
    const can =
      !!spec &&
      !prefersReducedMotion() &&
      typeof document !== "undefined" &&
      !document.hidden &&
      typeof Element !== "undefined" &&
      typeof Element.prototype.animate === "function";
    if (can && wrap.current) {
      const box = wrap.current.getBoundingClientRect();
      setSpot(`${Math.round(box.top + box.height / 2)}px`);
    }
    setPhase(can ? "run" : "done");
  }, [phase, ready, spec]);

  // The ceremony: every animation starts together, before the first painted frame.
  useLayoutEffect(() => {
    if (phase !== "run") return;
    const spinner = spin.current;
    if (!spinner) {
      setPhase("done");
      return;
    }
    const sign = document.documentElement.dir === "rtl" ? -1 : 1;
    const animations: Animation[] = [
      spinner.animate(spinFrames(sign), { duration: SPIN_MS, easing: "linear" }),
    ];
    if (stage.current) {
      animations.push(
        stage.current.animate(fadeInFrames(), { duration: FADE_IN_MS, easing: "linear" }),
      );
    }
    const dimEl = dim.current;
    if (dimEl)
      animations.push(dimEl.animate(dimFrames(), { duration: CEREMONY_MS, easing: "ease" }));
    const groundEl = ground.current;
    if (groundEl) animations.push(groundEl.animate(thudFrames(), { duration: SPIN_MS }));
    const stampEl = stamp.current;
    if (stampEl) {
      animations.push(
        stampEl.animate(stampFrames(sign), {
          duration: STAMP_MS,
          delay: STAMP_AT_MS,
          easing: "cubic-bezier(0.2, 0.9, 0.3, 1)",
          fill: "both",
        }),
      );
      animations.push(
        stampEl.animate(stampOutFrames(), {
          duration: CEREMONY_MS - FADE_AT_MS,
          delay: FADE_AT_MS,
          fill: "forwards",
        }),
      );
    }
    glint.current?.play({
      delay: IMPACT_MS,
      duration: tier === "legend" ? 760 : 520,
      rainbow: tier === "legend",
    });
    const impactTimer = window.setTimeout(() => setImpact(true), IMPACT_MS);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(impactTimer);
      window.clearTimeout(endTimer);
      setImpact(true);
      setPhase("done");
    };
    const endTimer = window.setTimeout(finish, CEREMONY_MS);
    // A tap or Escape: the card is at rest at once and the dim fades in 150 ms.
    run.current = {
      end: () => {
        if (finished) return;
        for (const animation of animations) {
          try {
            animation.finish();
          } catch {
            animation.cancel();
          }
        }
        window.clearTimeout(impactTimer);
        window.clearTimeout(endTimer);
        setImpact(true);
        const bright = dim.current;
        if (bright) {
          bright.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 150, fill: "forwards" });
        }
        window.setTimeout(finish, 150);
      },
    };
    return () => {
      finished = true;
      window.clearTimeout(impactTimer);
      window.clearTimeout(endTimer);
      run.current = null;
      for (const animation of animations) animation.cancel();
    };
  }, [phase, tier]);

  useEffect(() => {
    if (phase !== "run") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") run.current?.end();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const running = phase === "run";
  return (
    <div className="flex justify-center px-4 pb-[18px] pt-2" data-hero-card="">
      <div
        ref={wrap}
        className="relative isolate max-w-full"
        style={
          running
            ? ({ zIndex: 60, "--cer-y": spot } as CSSProperties)
            : phase === "wait"
              ? undefined
              : undefined
        }
        data-ceremony={running ? "1" : undefined}
      >
        {running ? (
          <div
            ref={dim}
            aria-hidden
            data-ceremony-dim=""
            className="mc-cer-dim"
            onPointerDown={() => run.current?.end()}
          />
        ) : null}
        {running && impact && spec ? (
          <div className="contents" data-ceremony-burst="">
            <BurstLayer spec={spec} palette={palette} ms={BURST_RUN_MS} />
          </div>
        ) : null}
        {running ? <span ref={ground} aria-hidden className="mc-cer-ground" /> : null}
        <div ref={stage} className={running ? "[perspective:1400px]" : undefined}>
          <div
            ref={spin}
            className={running ? "relative [transform-style:preserve-3d]" : "relative"}
            data-hero-spin=""
          >
            <div
              className="relative [backface-visibility:hidden]"
              style={running ? { transform: "translateZ(1px)" } : undefined}
            >
              <ManagerCard
                profile={profile}
                width={296}
                beat={impact || phase === "done" ? beat : undefined}
                tilt={phase === "done"}
                className="md:w-[336px]!"
                testId="hero-card"
              />
              {running ? <CardGlint ref={glint} rtl={rtl} /> : null}
            </div>
            {running ? (
              <div
                aria-hidden
                className="absolute inset-0 [backface-visibility:hidden]"
                style={{ transform: "rotateY(180deg) translateZ(1px)" }}
              >
                <CardBack profile={profile} />
              </div>
            ) : null}
          </div>
        </div>
        {running ? (
          <span ref={stamp} aria-hidden className="mc-cer-stamp" data-ceremony-stamp="">
            <span className="mc-cer-stamp__glow">
              <span
                className="mc-cer-stamp__chip"
                style={{
                  backgroundColor: palette.deep,
                  boxShadow: `inset 0 0 0 2px ${palette.word}`,
                  color: palette.word,
                }}
              >
                <TierWord tier={tier} />
              </span>
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
