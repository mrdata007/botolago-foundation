/**
 * The launch splash: whether this page load shows it, decided before the
 * first paint.
 *
 * The splash used to mount after hydration, because the decision needs
 * `sessionStorage` and the server cannot see it. That put it on screen only
 * once the app's code had loaded, so a first-time visitor saw the page, then
 * watched it snap to the splash — measured at ~160ms of home page on a fast
 * desktop and ~4s on a throttled phone profile. It is now in the server HTML
 * on every load, hidden by `src/styles.css` unless `SPLASH_INIT_SCRIPT` (an
 * inline head script, like `THEME_INIT_SCRIPT`) marks this load by putting
 * `data-splash` on `<html>`. React only ever reads that decision back, after
 * mount, so the server markup and the first client render still match.
 *
 * The seen flag is written by the head script at the moment it decides, not
 * by a React effect. The effect version is what made the dev build (and so the
 * Lovable preview) skip the splash entirely: StrictMode runs mount effects
 * twice, and the second run read the flag the first run had just written.
 */

/** Once per browser-tab session. The e2e support seeds this exact key. */
export const SPLASH_SEEN_KEY = "botolago.splashShown";

/**
 * On `<html>` while this load's splash is up. The value is the
 * `performance.now()` at which the head script put it there, which is also
 * (to within a frame) when the splash was first painted.
 */
export const SPLASH_ATTRIBUTE = "data-splash";

/** On `<html>` once the app has taken the splash over. */
export const SPLASH_CLAIMED_ATTRIBUTE = "data-splash-claimed";

/**
 * If the app never starts — a chunk that fails to load, a browser too old for
 * the bundle — nothing would take the splash down, and it would sit over a
 * server-rendered page that is otherwise readable. So the head script takes
 * it down itself after this long, unless the app has claimed it by then.
 */
export const SPLASH_FAILSAFE_MS = 10_000;

/**
 * The inline head script, as source text. Same constraints as the theme's:
 * small and synchronous, every storage access inside the try (a browser that
 * blocks site data throws on the first touch, and then this load simply has no
 * splash), and no `</` sequence, so it cannot close its own `<script>`.
 */
export const SPLASH_INIT_SCRIPT = `(function(){try{var s=window.sessionStorage,k=${JSON.stringify(
  SPLASH_SEEN_KEY,
)};if(s.getItem(k)==="1")return;s.setItem(k,"1");var e=document.documentElement,a=${JSON.stringify(
  SPLASH_ATTRIBUTE,
)};e.setAttribute(a,String(Math.round(performance.now())));setTimeout(function(){if(!e.hasAttribute(${JSON.stringify(
  SPLASH_CLAIMED_ATTRIBUTE,
)}))e.removeAttribute(a)},${SPLASH_FAILSAFE_MS})}catch(x){}})();`;

/**
 * After mount only. When this load's splash went up, on the
 * `performance.now()` clock, or `null` when this load has no splash. Claims
 * it, so the head script's failsafe leaves it to the app from here.
 * Idempotent, which StrictMode's second run of a mount effect relies on.
 */
export function claimLaunchSplash(): number | null {
  if (typeof document === "undefined") return null;
  const root = document.documentElement;
  const raw = root.getAttribute(SPLASH_ATTRIBUTE);
  if (raw === null) return null;
  root.setAttribute(SPLASH_CLAIMED_ATTRIBUTE, "");
  const shownAt = Number(raw);
  return Number.isFinite(shownAt) ? shownAt : performance.now();
}

/** The splash has finished. Hide it for the rest of this page's life. */
export function releaseLaunchSplash(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.removeAttribute(SPLASH_ATTRIBUTE);
  root.removeAttribute(SPLASH_CLAIMED_ATTRIBUTE);
}
