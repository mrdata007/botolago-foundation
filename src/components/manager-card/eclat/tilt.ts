/**
 * The tilt (plan 8.3): on a mouse or a pen the card turns toward the pointer and its light follows
 * (the frame's specular streak, the jersey's shadow, the raised number, the foil); on a touch-only
 * screen it floats slowly while it is on screen. A finger scrolls the page, so a touch never tilts
 * it. It is flat 2D at rest, so text and hairlines are rasterised once and stay crisp; the 3D tree
 * exists only in the `--active`, `--idle` and `--settle` states (`eclat.css`, "3D").
 *
 * What this writes is transforms, and only transforms (`pose.ts` computes them): the card's turn,
 * each layer's height, each wall of the rims, the shadow, and the parts `lift.ts` took out of their
 * layers. Each is its own browser layer while the card moves, so a frame costs the compositor a few
 * matrix changes and the page nothing: no style recalculation of the card's thousand SVG elements,
 * no repaint, no raster. (The first version wrote two inherited custom properties on the card's
 * root: every SVG element under it was restyled and every layer repainted on every frame, and a
 * software-rendered browser held 20 to 30 frames a second. See the README.) The parts that cannot
 * be composited because they are gradients that move under a mask (the foil, the streak) are
 * written as transforms of small SVG roots of their own, which repaint alone and cheaply.
 *
 * Nothing here runs under reduced motion, nor on a card that was not asked to tilt. It writes
 * `--mc-ax` and `--mc-ay` on the root (and the foil overlay), a few inline transforms, and four
 * classes on the card's root, and removes them again on cleanup. The float stops while the page is
 * hidden and while the card is off screen, does not start while the card plays a beat, and is a
 * compositor animation: the main thread does nothing while a card floats. A float keeps its depth
 * (the layers' heights and the number's crop) until it stops: the end of its own opening turn, a
 * finger's tap or pan on the card and a pen that leaves do not end it.
 */
import { cropNum, liftCard } from "./lift";
import {
  LAYERS,
  RIM_PLANE,
  Z,
  castDelta,
  depth,
  follow,
  glintA,
  glintB,
  restLight,
  rim,
  rimRest,
  shadow,
  tilt,
  type Light,
} from "./pose";

type Part = HTMLElement | SVGElement;

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
const f3 = (v: number): string => v.toFixed(3);

/** The float's three lights (the first at the rest light, then across, then back near it), 7 s a way. */
const FLOAT_MS = 7000;
/** The inner parts' ease: time constants of the exponential approach (about a third of the lag). */
const TAU_ACTIVE = 45;
const TAU_SETTLE = 90;
const floatLights = (rtl: boolean): Light[] => {
  const m = rtl ? -1 : 1;
  return [
    [0.24 * m, 0.64],
    [-0.28 * m, 0.38],
    [0.1 * m, 0.2],
  ];
};

/** Every part the tilt moves, found once the card has been lifted (`lift.ts`). */
interface Parts {
  tilt: Part | null;
  shadow: Part | null;
  foil: Part | null;
  leaves: { el: Part; z: number }[];
  rimsGroup: Part | null;
  rims: { el: Part; k: number }[];
  cast: Part | null;
  hi: Part[];
  sh: Part[];
  foilShift: Part[];
  spec: Part[];
  light: Part[];
  glintA: Part[];
  glintB: Part[];
}

function collect(root: HTMLElement): Parts {
  const all = (sel: string): Part[] =>
    typeof root.querySelectorAll === "function" ? [...root.querySelectorAll<Part>(sel)] : [];
  const one = (sel: string): Part | null =>
    typeof root.querySelector === "function" ? root.querySelector<Part>(sel) : null;
  const leaves: Parts["leaves"] = [];
  for (const name of LAYERS) {
    if (name === "foil") continue;
    const el = one(`.mc-leaf--${name}`) ?? one(`.mc-l--${name}`);
    if (el) leaves.push({ el, z: Z[name] });
  }
  const rims = all(".mc-rim").map((el, i) => ({
    el,
    k: Number(/--k:\s*(\d)/.exec(el.getAttribute("style") ?? "")?.[1] ?? i + 1),
  }));
  return {
    tilt: one(".mc-eclat__tilt"),
    shadow: one(".mc-eclat__shadow"),
    foil: one(".mc-eclat__foil"),
    leaves,
    rimsGroup: one(".mc-rims"),
    rims,
    cast: one(".mc-cast"),
    hi: all(".mc-num-hi"),
    sh: all(".mc-num-sh"),
    foilShift: all(".mc-foil-shift"),
    spec: all(".mc-spec-shift"),
    light: all(".mc-light-follow"),
    glintA: all(".mc-glint-a"),
    glintB: all(".mc-glint-b"),
  };
}

/**
 * Mounts the tilt on the card inside `el` (`ManagerCard`'s host). Returns the cleanup.
 *
 * The host can have its markup set again after the tilt was mounted (it was, on about one page load
 * in six, forty milliseconds after the first time, with the same string: the card's root was
 * replaced by an identical one and the listeners stayed on the one that was removed, so the card
 * did not tilt until the next load). The tilt therefore follows the card: it watches the host's
 * children and mounts itself on whichever root is there.
 */
export function mountTilt(el: HTMLElement | null): () => void {
  if (!el || typeof window === "undefined") return () => undefined;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => undefined;
  let current: HTMLElement | null = null;
  let stop: (() => void) | null = null;
  const follow = (): void => {
    const root = el.querySelector<HTMLElement>(".mc-eclat");
    if (root === current) return;
    stop?.();
    stop = null;
    current = root;
    if (root) stop = mountOn(root);
  };
  follow();
  const watcher = typeof MutationObserver !== "undefined" ? new MutationObserver(follow) : null;
  watcher?.observe(el, { childList: true });
  return () => {
    watcher?.disconnect();
    stop?.();
    stop = null;
    current = null;
  };
}

/** The tilt of one card root; the cleanup puts the card back as it found it. */
function mountOn(root: HTMLElement): () => void {
  const rtl = root.getAttribute("dir") === "rtl";
  const rest = restLight(rtl);
  liftCard(root);
  const parts = collect(root);
  const everything: (Part | null)[] = [
    parts.tilt,
    parts.shadow,
    parts.foil,
    parts.rimsGroup,
    parts.cast,
    ...parts.leaves.map((l) => l.el),
    ...parts.rims.map((r) => r.el),
    ...parts.hi,
    ...parts.sh,
    ...parts.foilShift,
    ...parts.spec,
    ...parts.light,
  ];

  let raf = 0;
  let timer = 0;
  let enterTimer = 0;
  let floatTimer = 0;
  let floating: Animation[] = [];
  const put = (part: Part | null, transform: string): void => {
    if (part) part.style.transform = transform;
  };
  const writeLight = (light: Light): void => {
    root.style.setProperty("--mc-ax", f3(light[0]));
    root.style.setProperty("--mc-ay", f3(light[1]));
  };

  /** Every layer at the depth factor `t` (1 over the card, 0 flat). */
  const writeDepth = (t: number): void => {
    for (const { el: layer, z } of parts.leaves) put(layer, depth(z, t));
    put(parts.rimsGroup, depth(RIM_PLANE, t));
    put(parts.foil, depth(Z.foil, t));
  };

  /**
   * What the compositor moves, at depth factor `t` (at 0 each part is at its rest pose): the card's
   * turn, the shadow, the walls of the rims and the cast shadow's layer. The stylesheet eases each.
   */
  const writePose = (light: Light, t: number): void => {
    put(parts.tilt, tilt(light, t));
    put(parts.shadow, shadow(light));
    for (const { el: wall, k } of parts.rims) put(wall, t ? rim(k, light) : rimRest(k, rtl));
    put(parts.cast, t ? castDelta(light, rest) : "translate(0cqw, 0cqw)");
  };

  /**
   * What repaints when the light moves: the parts inside a layer, under a mask or a clip. They are
   * not composited, so they are eased here (`step`), one small SVG's repaint per frame, and only
   * while the light is still travelling.
   */
  const writeInner = (light: Light): void => {
    for (const p of parts.hi) put(p, follow("hi", light, rtl));
    for (const p of parts.sh) put(p, follow("sh", light, rtl));
    for (const p of parts.foilShift) put(p, follow("foil", light, rtl));
    for (const p of parts.spec) put(p, follow("spec", light, rtl));
    for (const p of parts.light) put(p, follow("light", light, rtl));
    for (const p of parts.glintA) p.style.opacity = String(glintA(light));
    for (const p of parts.glintB) p.style.opacity = String(glintB(light));
    parts.foil?.style.setProperty("--mc-ax", f3(light[0]));
    parts.foil?.style.setProperty("--mc-ay", f3(light[1]));
  };

  /* the light's travel: `lightT` is where it is going, `lightS` where the inner parts are */
  let lightT: Light = rest;
  let lightS: Light = rest;
  let settling = false;
  let loop = 0;
  let last = 0;
  const step = (now?: number): void => {
    loop = 0;
    const at = now ?? performance.now();
    const dt = Math.min(64, last ? at - last : 16);
    last = at;
    // the pointer's 120 ms lag, and the settle's 450 ms, as exponential approaches
    const k = 1 - Math.exp(-dt / (settling ? TAU_SETTLE : TAU_ACTIVE));
    const next: Light = [
      lightS[0] + (lightT[0] - lightS[0]) * k,
      lightS[1] + (lightT[1] - lightS[1]) * k,
    ];
    const done = Math.abs(lightT[0] - next[0]) < 0.002 && Math.abs(lightT[1] - next[1]) < 0.002;
    lightS = done ? lightT : next;
    writeInner(lightS);
    if (done) last = 0;
    else loop = requestAnimationFrame(step);
  };
  const travel = (to: Light): void => {
    lightT = to;
    if (!loop) {
      last = 0;
      loop = requestAnimationFrame(step);
    }
  };

  /** Back to the stylesheet's rest pose: no inline transform, opacity or light is left on any part. */
  const clear = (): void => {
    cropNum(root, false);
    if (loop) cancelAnimationFrame(loop);
    loop = 0;
    lightS = rest;
    lightT = rest;
    for (const p of everything) p?.style.removeProperty("transform");
    for (const p of [...parts.glintA, ...parts.glintB]) p.style.removeProperty("opacity");
    parts.foil?.style.removeProperty("--mc-ax");
    parts.foil?.style.removeProperty("--mc-ay");
  };

  // back to the flat 2D stack once the settle has run, unless the pointer is back; a card that
  // floats (a pen has just left it) goes back to its float, not to the flat stack
  const flat = (): void => {
    if (root.classList.contains("mc-eclat--active")) return;
    root.classList.remove("mc-eclat--settle", "mc-eclat--enter");
    if (root.classList.contains("mc-eclat--idle")) {
      if (!floating.length) startFloat();
      return;
    }
    clear();
  };

  /* ---------------------------------------------------------------- the float (touch-only) */
  /** Stops the float. `keep` leaves the card where it is (a pen took over); otherwise it goes flat. */
  const stopFloat = (keep: boolean): void => {
    clearTimeout(floatTimer);
    if (!floating.length) return;
    for (const a of floating) {
      if (keep) {
        try {
          a.commitStyles();
        } catch {
          /* a part that is gone has nothing to keep */
        }
      }
      a.cancel();
    }
    floating = [];
  };

  /* ---------------------------------------------------------------- the pointer */
  const begin = (): void => {
    clearTimeout(timer);
    clearTimeout(enterTimer);
    stopFloat(true);
    const first = !root.classList.contains("mc-eclat--active");
    root.classList.remove("mc-eclat--settle");
    root.classList.add("mc-eclat--active");
    settling = false;
    if (first) {
      cropNum(root, true, root.getBoundingClientRect().width);
      // the first turn toward the pointer takes the depth's 450 ms; after it the light follows at 120
      root.classList.add("mc-eclat--enter");
      enterTimer = window.setTimeout(() => root.classList.remove("mc-eclat--enter"), 450);
      writeDepth(1);
    }
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    const b = root.getBoundingClientRect();
    if (!(b.width > 0) || !(b.height > 0)) return;
    const light: Light = [
      clamp((2 * (e.clientX - b.left)) / b.width - 1),
      clamp(1 - (2 * (e.clientY - b.top)) / b.height),
    ];
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      begin();
      writeLight(light);
      writePose(light, 1);
      travel(light);
    });
  };
  const onLeave = (e?: PointerEvent): void => {
    // a finger lifting after a tap, or a pan taking the touch over, is not a pointer leaving a tilt
    // that never started: the float goes on
    if (e?.pointerType === "touch") return;
    cancelAnimationFrame(raf);
    clearTimeout(enterTimer);
    root.classList.remove("mc-eclat--enter");
    root.classList.add("mc-eclat--settle");
    root.classList.remove("mc-eclat--active");
    writeLight(rest);
    writeDepth(0);
    writePose(rest, 0);
    settling = true;
    travel(rest);
    clearTimeout(timer);
    // a fallback for the transition's end (520 ms: the settle is 450)
    timer = window.setTimeout(flat, 520);
  };
  const onEnd = (e: TransitionEvent): void => {
    if (e.target !== parts.tilt || e.propertyName !== "transform") return;
    // the float's own opening turn (450 ms) ends with this event too; only a settle ends in the flat stack
    if (root.classList.contains("mc-eclat--idle") && !root.classList.contains("mc-eclat--settle"))
      return;
    flat();
  };
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("pointercancel", onLeave);
  root.addEventListener("transitionend", onEnd);

  /* ---------------------------------------------------------------- the float (touch-only) */
  /** One compositor animation: `at(light)` is the transform at each of the float's three lights. */
  const animate = (part: Part | null, at: (light: Light) => string): void => {
    if (!part || typeof part.animate !== "function") return;
    const [a, b, c] = floatLights(rtl).map(at) as [string, string, string];
    floating.push(
      part.animate(
        [
          { transform: a, easing: "ease-in-out" },
          { transform: b, offset: 0.5, easing: "ease-in-out" },
          { transform: c },
        ],
        { duration: FLOAT_MS, iterations: Infinity, direction: "alternate" },
      ),
    );
  };
  const startFloat = (): void => {
    const [first] = floatLights(rtl) as [Light];
    // ease to the float's first pose over the depth's 450 ms, then float
    cropNum(root, true, root.getBoundingClientRect().width);
    writeDepth(1);
    writePose(first, 1);
    clearTimeout(floatTimer);
    floatTimer = window.setTimeout(() => {
      if (!root.classList.contains("mc-eclat--idle") || floating.length) return;
      animate(parts.tilt, (l) => tilt(l, 1));
      animate(parts.shadow, (l) => shadow(l));
      for (const { el: wall, k } of parts.rims) animate(wall, (l) => rim(k, l));
      animate(parts.cast, (l) => castDelta(l, rest));
    }, 450);
  };

  // a touch-only screen: a slow idle float, only while the card is on screen and the page is visible
  let observer: IntersectionObserver | null = null;
  let onScreen = false;
  const doc = typeof document !== "undefined" ? document : null;
  const syncIdle = (): void => {
    // a card that plays a beat does not float (plan 8.3, 9): it is drawn again without the beat when
    // it ends, and the tilt mounts on that drawing
    const want = onScreen && !doc?.hidden && !root.hasAttribute("data-mc-beat");
    const has = root.classList.contains("mc-eclat--idle");
    root.classList.toggle("mc-eclat--idle", want);
    if (want && !has) startFloat();
    if (!want && has) {
      stopFloat(false);
      if (!root.classList.contains("mc-eclat--active")) clear();
    }
  };
  const touchOnly =
    window.matchMedia?.("(hover: none)").matches && typeof IntersectionObserver !== "undefined";
  if (touchOnly) {
    observer = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      syncIdle();
    });
    observer.observe(root);
    doc?.addEventListener("visibilitychange", syncIdle);
  }

  return () => {
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerleave", onLeave);
    root.removeEventListener("pointercancel", onLeave);
    root.removeEventListener("transitionend", onEnd);
    doc?.removeEventListener("visibilitychange", syncIdle);
    observer?.disconnect();
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    clearTimeout(enterTimer);
    stopFloat(false);
    root.classList.remove(
      "mc-eclat--active",
      "mc-eclat--settle",
      "mc-eclat--idle",
      "mc-eclat--enter",
    );
    clear();
    root.style.removeProperty("--mc-ax");
    root.style.removeProperty("--mc-ay");
  };
}
