/**
 * The tilt (`CardRenderer.mount`): on a mouse or a pen the shield turns toward the pointer and its
 * light follows (the autograph's and the monogram's foil slide, the glare moves, the holographic
 * frame turns its prism); on a touch-only screen it floats slowly while it is on screen. A finger
 * scrolls the page, so a touch never tilts it. At rest the card is flat 2D (no transform, no
 * `preserve-3d`), so its text is rasterised once and stays crisp; the 3D tree exists only while
 * the card is `--active` (a pointer over it), `--idle` (floating) or `--settle` (easing back).
 *
 * What it writes: the tilt's `transform`, `--mc-ax` and `--mc-ay` (the light, -1 to 1) on the root,
 * and those three classes; all removed again on cleanup. The card is a few dozen elements, so a
 * frame's restyle is small; the float is a CSS animation (`shield.css`). Nothing here runs under
 * reduced motion (`ManagerCard` does not mount it, and this checks again), on a card playing a beat
 * (`ManagerCard` mounts it again when the beat ends), or while the page is hidden.
 */

const ACTIVE = "mc-shield--active";
const IDLE = "mc-shield--idle";
const SETTLE = "mc-shield--settle";
/** The settle's transition (`shield.css`), which the timer outlasts. */
const SETTLE_MS = 620;
/** Degrees at the card's edge. */
const TURN_Y = 11;
const TURN_X = 8;
/** The share of the remaining distance the light covers per frame (a soft lag). */
const EASE = 0.22;

const noop = (): void => undefined;
const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

const media = (query: string): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false;

/** Mounts the tilt on the card inside `host` and follows the host's markup if it is set again. */
export function mountShieldTilt(host: HTMLElement | null): () => void {
  if (!host || typeof window === "undefined") return noop;
  if (media("(prefers-reduced-motion: reduce)")) return noop;
  let current: Element | null = null;
  let stop = noop;
  const attach = () => {
    const root = host.firstElementChild;
    if (root === current) return;
    stop();
    current = root;
    stop = root?.classList?.contains("mc-shield") ? mountOn(root as HTMLElement) : noop;
  };
  attach();
  const observer =
    typeof MutationObserver !== "undefined" ? new MutationObserver(() => attach()) : null;
  observer?.observe(host, { childList: true });
  return () => {
    observer?.disconnect();
    stop();
    stop = noop;
    current = null;
  };
}

function mountOn(root: HTMLElement): () => void {
  // a card playing a beat stays still; the app mounts the tilt again when the beat ends
  if (root.hasAttribute("data-mc-beat")) return noop;
  const tilt = root.querySelector<HTMLElement>(".mc-shield__tilt");
  if (!tilt) return noop;
  return media("(hover: none)") ? float(root) : follow(root, tilt);
}

/** A touch-only screen: the card floats while it is on screen and the page is visible. */
function float(root: HTMLElement): () => void {
  let visible = true;
  const update = () => {
    root.classList.toggle(IDLE, visible && !document.hidden);
  };
  const observer =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
          update();
        })
      : null;
  observer?.observe(root);
  document.addEventListener("visibilitychange", update);
  update();
  return () => {
    observer?.disconnect();
    document.removeEventListener("visibilitychange", update);
    root.classList.remove(IDLE);
  };
}

/** A mouse or a pen: the card turns toward it, and eases back when it leaves. */
function follow(root: HTMLElement, tilt: HTMLElement): () => void {
  let target = { x: 0, y: 0 };
  let light = { x: 0, y: 0 };
  let frame = 0;
  let settleTimer = 0;
  let over = false;

  const write = () => {
    tilt.style.transform = `rotateX(${(-light.y * TURN_X).toFixed(2)}deg) rotateY(${(light.x * TURN_Y).toFixed(2)}deg)`;
    root.style.setProperty("--mc-ax", light.x.toFixed(3));
    root.style.setProperty("--mc-ay", light.y.toFixed(3));
  };
  const step = () => {
    frame = 0;
    light = {
      x: light.x + (target.x - light.x) * EASE,
      y: light.y + (target.y - light.y) * EASE,
    };
    write();
    if (Math.abs(target.x - light.x) > 0.002 || Math.abs(target.y - light.y) > 0.002) {
      frame = requestAnimationFrame(step);
    }
  };
  const clearAll = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    window.clearTimeout(settleTimer);
    root.classList.remove(ACTIVE, SETTLE);
    tilt.style.removeProperty("transform");
    root.style.removeProperty("--mc-ax");
    root.style.removeProperty("--mc-ay");
    light = { x: 0, y: 0 };
    target = { x: 0, y: 0 };
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const box = root.getBoundingClientRect();
    if (!box.width || !box.height) return;
    target = {
      x: clamp(((event.clientX - box.left) / box.width) * 2 - 1),
      y: clamp(((event.clientY - box.top) / box.height) * 2 - 1),
    };
    if (!over) {
      over = true;
      window.clearTimeout(settleTimer);
      root.classList.remove(SETTLE);
      root.classList.add(ACTIVE);
    }
    if (!frame) frame = requestAnimationFrame(step);
  };
  const onLeave = (event: PointerEvent) => {
    if (event.pointerType === "touch" || !over) return;
    over = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    // ease back to the flat card: the transition runs on the last pose to none, then the 3D tree goes
    root.classList.add(SETTLE);
    root.classList.remove(ACTIVE);
    light = { x: 0, y: 0 };
    target = { x: 0, y: 0 };
    write();
    settleTimer = window.setTimeout(clearAll, SETTLE_MS);
  };

  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("pointercancel", onLeave);
  return () => {
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerleave", onLeave);
    root.removeEventListener("pointercancel", onLeave);
    clearAll();
  };
}
