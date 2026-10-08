import { useEffect, useId, useMemo, useRef, type JSX, type ReactNode } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ui, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import type { BeatName, CardProfile } from "../types";
import { HeroFrame } from "./HeroFrame";
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
 * The card is the page's own stage (`CardStage`), kept in place between the label row and the
 * lines: pass it as `children` (a node, or a function of the beat to play on it). With no
 * `children` the hero draws as one card above the stage; the stage then reads the beat from the
 * gate (`useMomentGate("gradins", card).hero?.beat`). Either way the beat plays on the stage
 * card, over a number that is already legible, once.
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
    if (hero) gate.ack(hero.keys);
  });

  const stage = (beat: BeatName | undefined): ReactNode =>
    typeof children === "function" ? children({ beat }) : children;

  const active = shown && !!hero;
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
      acked={gate.acked}
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
      {children ? stage(active ? (hero?.beat ?? undefined) : undefined) : undefined}
    </HeroFrame>
  );
}
