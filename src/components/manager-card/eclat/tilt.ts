/**
 * The tilt (plan 8.3): on a mouse or a pen the card turns toward the pointer and its light follows
 * (the frame's specular streak, the jersey's shadow, the raised number, the foil); on a touch-only
 * screen it floats slowly while it is on screen. A finger scrolls the page, so a touch never tilts
 * it. It is flat 2D at rest, so text and hairlines are rasterised once and stay crisp; the 3D tree
 * exists only in the `--active`, `--idle` and `--settle` states (`eclat.css`, "3D").
 *
 * Nothing here runs under reduced motion, nor on a card that was not asked to tilt. It writes only
 * `--mc-ax` and `--mc-ay` and three classes on the card's root, and removes them again on cleanup.
 */

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

/** Mounts the tilt on the card inside `el` (`ManagerCard`'s host). Returns the cleanup. */
export function mountTilt(el: HTMLElement | null): () => void {
  if (!el || typeof window === "undefined") return () => undefined;
  const root = el.querySelector<HTMLElement>(".mc-eclat");
  if (!root) return () => undefined;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => undefined;

  const rest: [number, number] = [root.getAttribute("dir") === "rtl" ? -0.24 : 0.24, 0.64];
  let raf = 0;
  let timer = 0;
  const set = (ax: number, ay: number) => {
    root.style.setProperty("--mc-ax", ax.toFixed(3));
    root.style.setProperty("--mc-ay", ay.toFixed(3));
  };
  // back to the flat 2D stack once the settle has run, unless the pointer is back
  const flat = () => {
    if (!root.classList.contains("mc-eclat--active")) root.classList.remove("mc-eclat--settle");
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    const b = root.getBoundingClientRect();
    if (!(b.width > 0) || !(b.height > 0)) return;
    const ax = clamp((2 * (e.clientX - b.left)) / b.width - 1);
    const ay = clamp(1 - (2 * (e.clientY - b.top)) / b.height);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      clearTimeout(timer);
      root.classList.remove("mc-eclat--settle");
      root.classList.add("mc-eclat--active");
      set(ax, ay);
    });
  };
  const onLeave = () => {
    cancelAnimationFrame(raf);
    root.classList.add("mc-eclat--settle");
    root.classList.remove("mc-eclat--active");
    set(rest[0], rest[1]);
    clearTimeout(timer);
    // a fallback for the transition's end (520 ms: the settle is 450)
    timer = window.setTimeout(flat, 520);
  };
  const onEnd = (e: TransitionEvent) => {
    if (e.target === root && e.propertyName === "--mc-t") flat();
  };
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("transitionend", onEnd);

  // a touch-only screen: a slow idle float while the card is on screen
  let observer: IntersectionObserver | null = null;
  if (window.matchMedia?.("(hover: none)").matches && typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(([entry]) =>
      root.classList.toggle("mc-eclat--idle", !!entry?.isIntersecting),
    );
    observer.observe(root);
  }

  return () => {
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerleave", onLeave);
    root.removeEventListener("transitionend", onEnd);
    observer?.disconnect();
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    root.classList.remove("mc-eclat--active", "mc-eclat--settle", "mc-eclat--idle");
    root.style.removeProperty("--mc-ax");
    root.style.removeProperty("--mc-ay");
  };
}
