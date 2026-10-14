import { useRef, type KeyboardEvent } from "react";

import { radioKeyTarget } from "@/components/shell/radio-keys";
import type { CardProfile } from "@/components/manager-card/types";

import { PlusCard } from "./PlusCard";
import { PLUS_STYLES, styleLabel, usePlusCopy, type PlusStyle } from "./plus-copy";

/**
 * Screen 1, « Ta carte, à ton style » (sketch `#screen-1`): the member's card as the hero, the
 * four-style radio group, the one reassurance above the button. The card does not change with the
 * style yet (lane E; see `PlusCard`), the choice is kept and announced.
 */
export function PlusStyleScreen({
  profile,
  style,
  onStyle,
  onNext,
  titleRef,
}: {
  profile: CardProfile;
  style: PlusStyle;
  onStyle: (style: PlusStyle) => void;
  onNext: () => void;
  titleRef: React.Ref<HTMLHeadingElement>;
}) {
  const { t } = usePlusCopy();
  return (
    <>
      <div className="plus-body">
        <h1 className="plus-h" id="plus-s1-title" tabIndex={-1} ref={titleRef}>
          {t("plus.s1.title")}
        </h1>
        <div className="plus-hero">
          <PlusCard profile={profile} width={312} edition={style} />
        </div>
        <StyleSelector style={style} onStyle={onStyle} />
        <p className="plus-sr-only" role="status" aria-live="polite">
          {t("plus.s1.live").replace("{style}", styleLabel(t, style))}
        </p>
      </div>
      <div className="plus-foot">
        <p className="plus-rule-line">{t("plus.rule")}</p>
        <button type="button" className="plus-btn plus-btn--primary" onClick={onNext}>
          {t("plus.s1.cta")}
        </button>
      </div>
    </>
  );
}

/** The four styles as a radio group: arrows follow the reading direction, Home and End jump. */
export function StyleSelector({
  style,
  onStyle,
}: {
  style: PlusStyle;
  onStyle: (style: PlusStyle) => void;
}) {
  const { t, lang } = usePlusCopy();
  const refs = useRef<Partial<Record<PlusStyle, HTMLButtonElement | null>>>({});
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let target: PlusStyle | null = null;
    if (event.key === "Home") target = PLUS_STYLES[0]!;
    else if (event.key === "End") target = PLUS_STYLES[PLUS_STYLES.length - 1]!;
    else target = radioKeyTarget(PLUS_STYLES, event, style, lang === "ar");
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    onStyle(target);
    refs.current[target]?.focus();
  };
  return (
    <div
      className="plus-swatches"
      role="radiogroup"
      aria-label={t("plus.style.label")}
      onKeyDown={onKeyDown}
    >
      {PLUS_STYLES.map((s) => (
        <button
          key={s}
          ref={(node) => {
            refs.current[s] = node;
          }}
          type="button"
          role="radio"
          aria-checked={s === style}
          tabIndex={s === style ? 0 : -1}
          className="plus-swatch"
          onClick={() => onStyle(s)}
        >
          <i className={`plus-sw-${s}`} aria-hidden />
          <span>{styleLabel(t, s)}</span>
        </button>
      ))}
    </div>
  );
}
