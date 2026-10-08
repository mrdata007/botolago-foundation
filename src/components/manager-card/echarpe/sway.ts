/**
 * The sway: drag the scarf and it swings from the rail, a damped pendulum, back to rest in about a
 * second. A mouse or a pen only, while the button is pressed (a finger scrolls the page). It does
 * nothing under reduced motion, while the page is hidden, or on a card with no swaying group
 * (LEGEND is held, not hung). Returns a cleanup.
 */
import { RAIL_H, RAIL_Y, VW } from "./geometry";
import { f2 } from "./knit";

const MAX_MS = 1200;

export function mountSway(el: HTMLElement | null): () => void {
  if (!el || typeof window === "undefined") return () => undefined;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => undefined;
  const g = el.querySelector<SVGGElement>(".mc-sway");
  if (!g) return () => undefined;
  let a = 0;
  let v = 0;
  let lastX: number | null = null;
  let raf = 0;
  let started = 0;
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    a = 0;
    v = 0;
    g.removeAttribute("transform");
  };
  const step = (now: number) => {
    if (document.hidden) return stop();
    v += -a * 0.06;
    v *= 0.9;
    a += v;
    g.setAttribute("transform", `rotate(${f2(a)} ${VW / 2} ${RAIL_Y + RAIL_H / 2})`);
    if (now - started < MAX_MS && (Math.abs(a) > 0.02 || Math.abs(v) > 0.02))
      raf = requestAnimationFrame(step);
    else stop();
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    lastX = e.clientX;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer that cannot be captured still swings the scarf while it is over it */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" || lastX === null || e.buttons === 0) return;
    v += Math.max(-0.5, Math.min(0.5, (e.clientX - lastX) * -0.02));
    lastX = e.clientX;
    if (!raf) {
      started = performance.now();
      raf = requestAnimationFrame(step);
    }
  };
  const onUp = () => {
    lastX = null;
  };
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("pointerleave", onUp);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("pointerleave", onUp);
    stop();
  };
}
