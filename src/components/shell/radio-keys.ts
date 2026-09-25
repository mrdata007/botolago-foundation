import type { RovingKey } from "@/components/ui-kit/tabs-keyboard";

/** How far each arrow moves along the group, in reading order. */
const STEP: Record<string, (rtl: boolean) => 1 | -1> = {
  ArrowDown: () => 1,
  ArrowUp: () => -1,
  ArrowRight: (rtl) => (rtl ? -1 : 1),
  ArrowLeft: (rtl) => (rtl ? 1 : -1),
};

/**
 * The option an arrow key moves a radio group to, or `null` when the key is
 * not the group's to handle (then the caller must not prevent its default).
 *
 * The WAI-ARIA radio group pattern: Down and Right move to the next option,
 * Up and Left to the previous one, wrapping at both ends, and the move checks
 * the option it lands on. "Next" along a row is the reading direction, so
 * under `dir="rtl"` Left moves forward — the same rule as `rovingTarget` for
 * tabs. Up and Down follow the list, which reads top to bottom in both
 * languages. A modified arrow is the browser's or the OS's (Alt+Left is Back).
 */
export function radioKeyTarget<T>(
  options: readonly T[],
  event: RovingKey,
  from: T,
  rtl: boolean,
): T | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const step = Object.hasOwn(STEP, event.key) ? STEP[event.key](rtl) : 0;
  if (step === 0 || options.length === 0) return null;
  const at = Math.max(0, options.indexOf(from));
  return options[(at + step + options.length) % options.length];
}
