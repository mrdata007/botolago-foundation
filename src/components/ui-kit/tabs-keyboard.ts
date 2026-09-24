/**
 * The roving-focus arithmetic behind `UiTabs`, kept out of the component and
 * free of the DOM so it can be tested directly: which tab holds the one tab
 * stop, and which tab a key moves to.
 *
 * The keys follow the WAI-ARIA tabs pattern: ArrowLeft/ArrowRight move to
 * the previous/next enabled tab, wrapping at the ends, and "next" is the
 * READING direction — so under `dir="rtl"` ArrowLeft moves forward. Home and
 * End jump to the first and last enabled tab. Disabled tabs are skipped.
 */

export interface RovingOption<T> {
  value: T;
  disabled?: boolean;
}

/** What `rovingTarget` reads from a keyboard event. */
export interface RovingKey {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

const ROVING_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/**
 * The one tab in the tab order: the selected tab when it is enabled, else the
 * first enabled tab — a tablist whose selection is disabled or absent must
 * still be reachable with Tab. `undefined` only when every tab is disabled.
 */
export function rovingTabStop<T>(options: ReadonlyArray<RovingOption<T>>, value: T): T | undefined {
  const enabled = options.filter((option) => !option.disabled);
  return enabled.some((option) => option.value === value) ? value : enabled[0]?.value;
}

/**
 * The tab a key moves focus (and the selection) to, or `null` when the key
 * is not the tablist's to handle — then the caller must NOT prevent its
 * default, so the browser and the OS keep it:
 *   - a modified key: Alt+ArrowLeft/Right is Back/Forward, Ctrl/Cmd+Home/End
 *     scroll the page, Cmd+Arrow is a macOS shortcut;
 *   - any key other than the four arrows/Home/End;
 *   - a tablist with no enabled tab.
 *
 * `focused` is the tab that has focus (the event target); when it is not an
 * enabled tab, the move starts from the tab stop.
 */
export function rovingTarget<T>(
  options: ReadonlyArray<RovingOption<T>>,
  event: RovingKey,
  focused: T | undefined,
  value: T,
  rtl: boolean,
): T | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (!ROVING_KEYS.has(event.key)) return null;
  const enabled = options.filter((option) => !option.disabled);
  if (enabled.length === 0) return null;
  if (event.key === "Home") return enabled[0].value;
  if (event.key === "End") return enabled[enabled.length - 1].value;

  const stop = rovingTabStop(options, value);
  const at = enabled.findIndex((option) => option.value === focused);
  const current = at >= 0 ? at : enabled.findIndex((option) => option.value === stop);
  const forward = (event.key === "ArrowRight") !== rtl;
  const next = (current + (forward ? 1 : -1) + enabled.length) % enabled.length;
  return enabled[next].value;
}
