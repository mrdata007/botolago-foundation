import { X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, type JSX, type ReactNode } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ui, UiCard, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import { ManagerCard } from "../ManagerCard";
import type { BeatName, CardProfile } from "../types";
import { Collapsible, HeroCard, HeroFrame } from "./HeroFrame";
import { InviteFriends } from "./InviteFriends";
import { bornText, compactBornLines, HERO_EVENTS, momentWords, type BornText } from "./moment-text";
import { useMomentGate, useSeenFor } from "./use-moment-gate";

/**
 * The card-born panel (plan moment M2, 5.1 and 5.3): the card is made with the first saved squad,
 * with no number yet, and the panel says so, says exactly when the number will arrive, and offers
 * the one social act that is true (« Inviter des amis »). Above the pitch on `/fantasy/team`
 * (`surface="team"`: compact, about 215 px at 390, so the pitch's first row stays on the first
 * screen: the card at 96 px beside the heading with its ×, the number when there is one and when
 * the rating comes, then « Inviter des amis » as a 44 px text line; the sentence on why now is that
 * action's accessible description), or in Gradins' hero slot
 * (`surface="gradins"`: the panel carries the card at the stage's size and plays the `make` beat on
 * it, the way the hero does; a page that keeps its own stage in the tree passes it as `children`).
 *
 * It decides for itself whether it is due (`useMomentGate(surface, card)`): `card_created`
 * pending, no number yet, the launch gate open, no other hero shown this session, nothing else
 * open. The last hour before a deadline does not hold it back: it is the save's own continuation.
 * Never a dialog and never opened by anything but the data: the × and the button acknowledge
 * `card_created` in one call, and so do two seconds with at least half of it on screen.
 *
 * Fantasy loads it with `React.lazy` (nothing of `moments/**` is imported statically outside
 * Gradins), so it is also the module's default export.
 */
export function CardBornPanel({
  card,
  profile,
  nextDeadline,
  surface,
  children,
}: {
  card: MyCardDto;
  profile: CardProfile;
  /** The next Fantasy deadline (ISO), or null when it is not known. */
  nextDeadline: string | null;
  surface: "team" | "gradins";
  /** `gradins` only: the page's stage, kept between the label row and the lines. */
  children?: ReactNode | ((stage: { beat: BeatName | undefined }) => ReactNode);
}): JSX.Element | null {
  const { t, lang } = useI18n();
  const words = useMemo(() => momentWords(t, lang), [t, lang]);
  const gate = useMomentGate(surface, card);
  const hero = gate.hero;
  const headingId = useId();
  const inviteId = useId();
  const ref = useRef<HTMLElement | null>(null);

  const startedAcked = useRef(gate.acked);
  const born = !!hero && (hero.kind === "born_new" || hero.kind === "born_arrival");
  const shown = born && !startedAcked.current;

  const counted = useRef(false);
  useEffect(() => {
    if (!shown || !gate.ready || counted.current || !hero) return;
    counted.current = true;
    track(HERO_EVENTS[hero.kind].view);
  }, [shown, gate.ready, hero]);

  useSeenFor(ref, shown && !gate.acked, () => {
    if (hero) gate.ack(hero.keys, { collapse: false });
  });

  const stage = (beat: BeatName | undefined): ReactNode =>
    children === undefined ? (
      <HeroCard profile={profile} beat={beat} />
    ) : typeof children === "function" ? (
      children({ beat })
    ) : (
      children
    );

  const keys = hero?.keys ?? [];
  const close = () => {
    gate.ack(keys);
    track("card_born_close");
  };
  const invite = () => {
    gate.ack(keys);
    track("card_born_invite");
  };

  if (surface === "gradins") {
    // Nothing to draw until the panel is due, and the page's slot stays empty.
    if (!shown && children === undefined) return null;
    const text = shown ? bornText(card, words, nextDeadline) : null;
    return (
      <HeroFrame
        active={shown}
        acked={gate.collapsed}
        headingId={headingId}
        heading={words.moment.m2.heading}
        closeLabel={t("common.close")}
        onClose={close}
        sectionRef={ref}
        testId="card-born-panel"
        kind={hero?.kind ?? ""}
        lines={text ? <BornLines text={text} /> : null}
        actions={<InviteFriends onInvite={invite} />}
      >
        {stage(shown ? (hero?.beat ?? undefined) : undefined)}
      </HeroFrame>
    );
  }

  if (!shown || !hero) return null;
  const text = bornText(card, words, nextDeadline);
  const lines = compactBornLines(text);
  return (
    <div className={cn(ui.space.gutter, "pt-3")}>
      <Collapsible collapsed={gate.collapsed} animate>
        <section
          ref={ref}
          aria-labelledby={headingId}
          data-testid="card-born-panel"
          data-hero-kind={hero.kind}
          data-collapsed={gate.collapsed ? "1" : undefined}
        >
          <UiCard padding="md" className="mb-3">
            <div className="flex items-start gap-3">
              <ManagerCard
                profile={profile}
                width={96}
                beat={hero.beat ?? undefined}
                testId="born-card"
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                {/* The × is a 44 px control: it reaches into the card's padding rather than add to its height. */}
                <div className="-mt-2 flex min-h-[var(--ui-tap-min)] items-center justify-between gap-2">
                  <h2 id={headingId} className={cn("min-w-0 text-balance", ui.display.teamSm)}>
                    {words.moment.m2.heading}
                  </h2>
                  <UiIconButton
                    aria-label={t("common.close")}
                    onClick={close}
                    data-testid="card-born-panel-close"
                    className="-me-1 shrink-0"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </UiIconButton>
                </div>
                <BornLines text={{ lines, invite: null }} aligned />
              </div>
            </div>
            {text.invite ? (
              // Why now. The panel leaves the pitch's first row on screen, so the sentence is the
              // action's description for a screen reader; Gradins' hero says it in the open.
              <p id={inviteId} className="sr-only" data-testid="born-invite-line">
                {text.invite}
              </p>
            ) : null}
            <InviteFriends
              variant="link"
              onInvite={invite}
              describedBy={text.invite ? inviteId : undefined}
            />
          </UiCard>
        </section>
      </Collapsible>
    </div>
  );
}

export default CardBornPanel;

function BornLines({ text, aligned = false }: { text: BornText; aligned?: boolean }) {
  return (
    <div
      className={cn("flex flex-col gap-1.5", !aligned && "text-center text-balance")}
      data-testid="born-lines"
    >
      {text.lines.map((line, index) => (
        <p
          key={index}
          className={cn(
            line.strong ? ui.text.bodyStrong : ui.text.secondary,
            line.strong ? ui.tone.default : ui.tone.muted,
          )}
        >
          {line.text}
        </p>
      ))}
      {!aligned && text.invite ? (
        <p className={cn(ui.text.body, ui.tone.default)} data-testid="born-invite-line">
          {text.invite}
        </p>
      ) : null}
    </div>
  );
}
