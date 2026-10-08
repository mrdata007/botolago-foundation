import { useEffect, useId, useMemo, useRef, type JSX, type ReactNode } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ui, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import type { BeatName, CardProfile } from "../types";
import { HeroCard, HeroFrame } from "./HeroFrame";
import { HERO_EVENTS, heroText, momentWords } from "./moment-text";
import { useMomentGate, useSeenFor } from "./use-moment-gate";

/**
 * The hero on Gradins' home (plan section 5.3): the one moment this session may expand, as an
 * inline block of the page and never as a dialog. It decides for itself whether there is one: it
 * asks the moment gate (`useMomentGate("gradins", card)`, the same decision every other component
 * of the page reads) and draws nothing when no hero is due, when the launch gate is still closed,
 * when a hero was already shown in this session, or within the last hour before a deadline. The
 * born panel (`card_created` with no number yet) is `CardBornPanel`'s, not this one's.
 *
 * Anatomy: a 44 px row with the label and a 44 px ×; the card; the lines; two 48 px buttons (the
 * details, then « Partager »). The × and either button acknowledge the moment's keys in one call,
 * and so do two seconds with at least half of the block on screen. After that the label row, the
 * lines and the buttons collapse and the card stays: the stage is the ordinary stage again.
 *
 * The hero carries the card: between the label row and the lines it draws the full card at the
 * stage's size and plays the beat on it, over a number that is already legible, once. The page
 * leaves its own copy of the card out while the slot holds a hero (Gradins' home hides it by CSS
 * on `[data-hero-slot]:not(:empty)`), and keeps the rating and identity lines under it. After
 * acknowledgement the label row, the lines and the buttons collapse and the card stays. A page
 * that would rather keep its own stage in the tree passes it as `children` (a node, or a
 * function of the beat to play on it); then the hero is only the frame around it.
 */
export function MomentHero({
  card,
  profile,
  onDetail,
  onShare,
  children,
}: {
  surface: "gradins";
  card: MyCardDto;
  profile: CardProfile;
  onDetail: () => void;
  onShare: () => void;
  children?: ReactNode | ((stage: { beat: BeatName | undefined }) => ReactNode);
}): JSX.Element | null {
  const { t, lang } = useI18n();
  const words = useMemo(() => momentWords(t, lang), [t, lang]);
  const gate = useMomentGate("gradins", card);
  const hero = gate.hero;
  const headingId = useId();
  const ref = useRef<HTMLElement | null>(null);

  // A hero that was already acknowledged when this page mounted (the manager came back to Gradins
  // in the same visit) is not shown again, collapsed or otherwise.
  const startedAcked = useRef(gate.acked);
  const shown =
    !!hero && !startedAcked.current && hero.kind !== "born_new" && hero.kind !== "born_arrival";

  const counted = useRef(false);
  useEffect(() => {
    if (!shown || !gate.ready || counted.current || !hero) return;
    counted.current = true;
    track(HERO_EVENTS[hero.kind].view);
  }, [shown, gate.ready, hero]);

  useSeenFor(ref, shown && !gate.acked, () => {
    if (hero) gate.ack(hero.keys, { collapse: false });
  });

  // The card the hero carries: the page's own stage when it passes one, else the hero draws it.
  const stage = (beat: BeatName | undefined): ReactNode =>
    children === undefined ? (
      <HeroCard profile={profile} beat={beat} />
    ) : typeof children === "function" ? (
      children({ beat })
    ) : (
      children
    );

  const active = shown && !!hero;
  // With no stage of the page's to keep in the tree, there is nothing to draw until a hero is due,
  // and the slot the page gives the hero stays empty.
  if (!active && children === undefined) return null;
  const text = active ? heroText(hero, card, words) : null;
  const events = active ? HERO_EVENTS[hero.kind] : null;
  const canShare = profile.ovr !== null;
  const keys = hero?.keys ?? [];

  const close = () => {
    gate.ack(keys);
    if (events?.close) track(events.close);
  };

  return (
    <HeroFrame
      active={active}
      acked={gate.collapsed}
      headingId={headingId}
      heading={text?.label}
      closeLabel={t("common.close")}
      onClose={close}
      sectionRef={ref}
      testId="moment-hero"
      kind={hero?.kind ?? ""}
      lines={
        text && text.lines.length > 0 ? (
          <div className="flex flex-col gap-1.5 text-center text-balance" data-testid="hero-lines">
            {text.lines.map((line, index) => (
              <p
                key={index}
                className={cn(index === 0 ? ui.text.body : ui.text.secondary, ui.tone.default)}
              >
                {line}
              </p>
            ))}
          </div>
        ) : null
      }
      actions={
        <div className={cn("grid gap-2", canShare ? "grid-cols-2" : "grid-cols-1")}>
          <UiButton
            variant="gradient"
            data-testid="hero-detail"
            onClick={() => {
              gate.ack(keys);
              if (events?.detail) track(events.detail);
              onDetail();
            }}
          >
            {text?.primary}
          </UiButton>
          {canShare ? (
            <UiButton
              variant="soft"
              data-testid="hero-share"
              onClick={() => {
                gate.ack(keys);
                onShare();
              }}
            >
              {t("article.share")}
            </UiButton>
          ) : null}
        </div>
      }
    >
      {stage(active ? (hero?.beat ?? undefined) : undefined)}
    </HeroFrame>
  );
}
