import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";

import { DASH, shouldCountUp, useSeasonFmt } from "./plus-season-fmt";
import { isMissing, type RatingCode } from "./plus-season-data";

import "./plus-season.css";

/** `useLayoutEffect` where there is a DOM (a count starts before the first paint, never flashes its final value). */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const COUNT_MS = 600;

const noSubscription = () => () => undefined;
/** True only for the render of a hydration (server snapshot), false for a render that starts on the client. */
function useHydrating(): boolean {
  return !useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * A figure that counts from 0 to its value in 600 ms (cubic ease-out) and lands on the exact final
 * text. The server render, the first paint under reduced motion and the end of the count are all
 * the same string. Left to right and isolated, so a sign never detaches from its digits in Arabic.
 */
export function Num({
  value,
  decimals = 0,
  sign = false,
  className,
}: {
  value: number;
  decimals?: number;
  sign?: boolean;
  className?: string;
}) {
  const { num } = useSeasonFmt();
  const final = num(value, decimals, sign);
  const [text, setText] = useState(final);
  const hydrating = useHydrating();
  const painted = useRef<boolean | null>(null);
  if (painted.current === null) painted.current = hydrating;
  const numRef = useRef(num);
  numRef.current = num;
  useIsoLayoutEffect(() => {
    if (
      isMissing(value) ||
      !shouldCountUp({ hydrating: painted.current === true, reducedMotion: prefersReducedMotion() })
    ) {
      setText(final);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    setText(numRef.current(0, decimals, sign));
    const step = (now: number) => {
      if (start === null) start = now;
      const p = Math.min((now - start) / COUNT_MS, 1);
      const eased = 1 - (1 - p) ** 3;
      setText(p < 1 ? numRef.current(value * eased, decimals, sign) : final);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      setText(final);
    };
  }, [value, decimals, sign, final]);
  return (
    <bdi dir="ltr" className={`ps-num${className ? ` ${className}` : ""}`}>
      {text}
    </bdi>
  );
}

/** A figure that does not count (a figure inside a sentence or a table cell): isolated, left to right. */
export function Fig({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={`ps-num${className ? ` ${className}` : ""}`}>
      {showable(children)}
    </bdi>
  );
}

/** A missing figure (`NaN`, alone or inside a built string) is written as a dash, never as "NaN". */
function showable(node: ReactNode): ReactNode {
  if (typeof node === "number") return isMissing(node) ? DASH : node;
  if (typeof node === "string") return node.replace(/NaN/g, DASH);
  if (Array.isArray(node))
    return node.map((child, i) => <Fragment key={i}>{showable(child)}</Fragment>);
  return node;
}

export interface PlusTab<K extends string> {
  key: K;
  label: string;
}

/**
 * Four pill tabs: an accessible tablist (roving tabindex, arrows that follow the reading direction,
 * Home and End), 44 px targets, a frosted bar that sticks under the offer's top bar, and a mint
 * pill that slides to the chosen tab (`translateX`, 240 ms). The panel it controls is `PlusPanel`.
 */
export function PlusTabs<K extends string>({
  id,
  tabs,
  value,
  onChange,
  label,
}: {
  id: string;
  tabs: readonly PlusTab<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const { lang } = useI18n();
  const bar = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === value),
  );

  const choose = useCallback(
    (key: K, focus: boolean) => {
      onChange(key);
      const el = bar.current;
      if (!el) return;
      if (focus) {
        const button = el.querySelector<HTMLElement>(`[data-tab="${key}"]`);
        button?.focus({ preventScroll: true });
      }
      // Keep the bar where it is stuck: a long tab must not leave the new one scrolled halfway.
      const scroller = el.closest<HTMLElement>(".plus-body");
      if (scroller) {
        const stuck = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        if (stuck <= 1) {
          scroller.scrollTop += stuck;
        }
      }
    },
    [onChange],
  );

  const onKey = (event: KeyboardEvent, i: number) => {
    const rtl = lang === "ar";
    let to: number | null = null;
    if (event.key === "ArrowRight") to = i + (rtl ? -1 : 1);
    else if (event.key === "ArrowLeft") to = i + (rtl ? 1 : -1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = tabs.length - 1;
    if (to === null) return;
    event.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    if (next) choose(next.key, true);
  };

  return (
    <div className="ps-tabs" ref={bar}>
      <div
        className="ps-seg"
        role="tablist"
        aria-label={label}
        style={{ ["--k" as string]: index, ["--n" as string]: tabs.length }}
      >
        <i className="ps-pill" aria-hidden />
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${id}-t-${tab.key}`}
            aria-controls={`${id}-p-${tab.key}`}
            aria-selected={tab.key === value}
            tabIndex={tab.key === value ? 0 : -1}
            data-tab={tab.key}
            onClick={() => choose(tab.key, false)}
            onKeyDown={(event) => onKey(event, i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The panel of a tab; it mounts when its tab is chosen, so its animations play once per visit. */
export function PlusPanel({ id, tab, children }: { id: string; tab: string; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`${id}-p-${tab}`}
      aria-labelledby={`${id}-t-${tab}`}
      className="ps-panel"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

/** A one-or-two word legend: a swatch and a label each. */
export function Key({ items }: { items: readonly { cls: string; label: string }[] }) {
  return (
    <ul className="ps-key">
      {items.map((item) => (
        <li key={item.cls + item.label}>
          <i className={item.cls} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function SignTri({ up }: { up: boolean }) {
  return <i className={`ps-tri ${up ? "u" : "d"}`} aria-hidden />;
}

const ICONS: Record<RatingCode, string> = {
  CAP: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.2 9.2a4.2 4.2 0 1 0 0 5.6",
  SEL: "M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z",
  TRF: "M4 8h14l-3-3M20 16H6l3 3",
  CON: "M5.5 5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4",
};
export function RatingIcon({ code, size = 20 }: { code: RatingCode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICONS[code]} />
    </svg>
  );
}
