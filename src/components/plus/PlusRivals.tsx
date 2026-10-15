import { ArrowLeftRight, Check, Info, Plus, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  initialsOf,
  leadChange,
  RIVAL_MAX,
  type Rival,
  type RivalCandidate,
} from "@/backend/premium/rivals";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useMyRivals, useRivalActions, useRivalCandidates } from "@/services/use-premium-rivals";

import { PlusEmbed, PlusLockedSection } from "./PlusLockedSection";
import { PlusInitials, PlusRivalPoster } from "./PlusRivalPoster";
import type { PlusAccess } from "./plus-access";
import { usePlusCopy } from "./plus-copy";
import { EXAMPLE_ME, exampleRivals } from "./plus-rivals-example";
import { stampText } from "./plus-rivals-text";
import { useSeasonFmt } from "./plus-season-fmt";

import "./plus-rivals.css";

/**
 * « Vos rivaux » (BotolaGO+) on Curva's home, under the friends: up to three friends from the
 * reader's private leagues, one matchday poster each, after every published journée.
 *   - off: nothing, no node and no request;
 *   - locked: one real thing clear (the reader's points against their closest league mate, from the
 *     standings the home already loads), the example board blurred, « Découvrir », and what the
 *     feature can and cannot see, said plainly before the subscription. The paid read is not called;
 *   - member: the posters, the lead-change banner, the notification switch (off until turned on),
 *     the way to add a rival and the WhatsApp picture of each poster.
 * A friend's captain and transfer appear only when that friend shares their card history.
 */

/** The reader as the free screens know them: the name, the league points and position. */
export interface RivalsSide {
  name: string;
  totalScore: number;
  rank: number;
}

export function PlusRivals({
  access,
  mine,
  closest,
  size,
}: {
  access: PlusAccess;
  mine: RivalsSide | null;
  /** The league mate closest in points (the free « Votre duel » pair), for the locked head. */
  closest: RivalsSide | null;
  size: number;
}) {
  if (access === "off") return null;
  return access === "locked" ? (
    <LockedRivals mine={mine} closest={closest} />
  ) : (
    <MemberRivals mine={mine} size={size} />
  );
}

/* ----------------------------------------------------------------------------- locked */

function LockedRivals({ mine, closest }: { mine: RivalsSide | null; closest: RivalsSide | null }) {
  const { t } = usePlusCopy();
  const gap = mine && closest ? mine.totalScore - closest.totalScore : null;
  return (
    <>
      <PlusLockedSection
        compact
        testId="plus-home-rivals-locked"
        via="rivals"
        headline={t("plus.rv.locked_title")}
        head={mine && closest ? <RealPair mine={mine} other={closest} gap={gap ?? 0} /> : null}
      >
        <ExampleBoard />
      </PlusLockedSection>
      <Limits />
    </>
  );
}

/** The one real thing, clear above the blur: two totals and who leads. */
function RealPair({ mine, other, gap }: { mine: RivalsSide; other: RivalsSide; gap: number }) {
  const { t, text } = usePlusCopy();
  const line =
    gap === 0
      ? t("plus.rv.level")
      : gap > 0
        ? text("plus.rv.lead_me", { gap: text("plus.rv.pts", { n: gap }) })
        : text("plus.rv.lead_him", {
            name: other.name,
            gap: text("plus.rv.pts", { n: -gap }),
          });
  return (
    <div className="pr-real" data-testid="plus-rivals-real">
      <div className="pr-real-face">
        <span className="pr-real-side">
          <PlusInitials name={mine.name} tone="me" small />
          <b>
            <bdi>{mine.name}</bdi>
          </b>
        </span>
        <span className="pr-real-score" dir="ltr">
          <span className="pr-sc-me">{mine.totalScore}</span>
          <i aria-hidden="true">–</i>
          <span className="pr-sc-rival">{other.totalScore}</span>
        </span>
        <span className="pr-real-side">
          <PlusInitials name={other.name} tone="rival" small />
          <b>
            <bdi>{other.name}</bdi>
          </b>
        </span>
      </div>
      <p className="pr-real-line">{line}</p>
    </div>
  );
}

/** What the reader would see: the board, from the example, under the blur. */
function ExampleBoard() {
  const { t } = usePlusCopy();
  const rivals = useMemo(() => exampleRivals(t("plus.rv.ex_a"), t("plus.rv.ex_b")), [t]);
  return (
    <BoardView
      me={EXAMPLE_ME}
      rank={null}
      size={null}
      rivals={rivals}
      notify={false}
      candidates={[]}
      example
    />
  );
}

/** The limits, said before the subscription and kept on the screen after it. */
function Limits() {
  const { t } = usePlusCopy();
  return (
    <PlusEmbed
      className="pr-limits"
      data-testid="plus-rivals-limits"
      aria-label={t("plus.rv.see_title")}
    >
      <h3 className="pr-limits-h">{t("plus.rv.see_title")}</h3>
      <ul className="pr-see">
        <li>
          <Check aria-hidden />
          <span>{t("plus.rv.see_1")}</span>
        </li>
        <li>
          <Check aria-hidden />
          <span>{t("plus.rv.see_2")}</span>
        </li>
        <li>
          <Check aria-hidden />
          <span>{t("plus.rv.see_3")}</span>
        </li>
      </ul>
      <div className="pr-privacy">
        <ShieldCheck aria-hidden />
        <div>
          <p className="pr-privacy-lim">{t("plus.rv.limit")}</p>
          <p>{t("plus.rv.privacy")}</p>
          <p className="pr-privacy-live">
            <Info aria-hidden />
            <span>{t("plus.rv.foot_live")}</span>
          </p>
        </div>
      </div>
    </PlusEmbed>
  );
}

/* ----------------------------------------------------------------------------- member */

function MemberRivals({ mine, size }: { mine: RivalsSide | null; size: number }) {
  const { t } = usePlusCopy();
  const board = useMyRivals(true);
  const data = board.data ?? null;
  const open = data !== null && data.rivals.length < data.max;
  const candidates = useRivalCandidates(open);
  const actions = useRivalActions();
  const [pinError, setPinError] = useState<"full" | "failed" | null>(null);

  const pin = useCallback(
    (candidate: RivalCandidate) => {
      setPinError(null);
      actions.pin.mutate(candidate.teamId, {
        onSuccess: (outcome) => {
          if (outcome.kind === "full") setPinError("full");
          else if (outcome.kind !== "pinned") setPinError("failed");
        },
        onError: () => setPinError("failed"),
      });
    },
    [actions.pin],
  );

  if (board.isPending) {
    return (
      <PlusEmbed
        className="pr-embed"
        data-testid="plus-rivals-loading"
        aria-labelledby="plus-rivals-title"
      >
        <h2 className="plus-h2 pl-title" id="plus-rivals-title">
          {t("plus.rv.title")}
        </h2>
        <div className="pl-skeleton" aria-hidden />
        <span className="sr-only">{t("plus.rv.loading")}</span>
      </PlusEmbed>
    );
  }
  if (board.isError) {
    return (
      <PlusEmbed
        className="pr-embed"
        data-testid="plus-rivals-failed"
        aria-labelledby="plus-rivals-title"
      >
        <h2 className="plus-h2 pl-title" id="plus-rivals-title">
          {t("plus.rv.title")}
        </h2>
        <p className="pr-fine" role="status">
          {t("plus.rv.failed")}
        </p>
      </PlusEmbed>
    );
  }
  // A switched-off, locked or season-less answer: the section stays quiet.
  if (!data || !data.me) return null;
  return (
    <BoardView
      me={{ name: data.me.name ?? mine?.name ?? "", total: data.me.total }}
      rank={mine?.rank ?? null}
      size={size > 0 ? size : null}
      rivals={data.rivals}
      notify={data.notify}
      onNotify={(value) => actions.notify.mutate(value)}
      notifyBusy={actions.notify.isPending}
      onUnpin={(rival) => actions.unpin.mutate(rival.teamId)}
      onPin={pin}
      candidates={candidates.data ?? []}
      candidatesPending={candidates.isPending && candidates.fetchStatus !== "idle"}
      pinError={pinError}
      busy={actions.pin.isPending || actions.unpin.isPending}
      max={data.max}
    />
  );
}

/* ------------------------------------------------------------------------------- board */

/** The index of the poster the rail is showing (the page dots follow the scroll). */
function useRailIndex(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const rail = ref.current;
    if (!rail || count < 2) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const first = rail.children[0] as HTMLElement | undefined;
        const second = rail.children[1] as HTMLElement | undefined;
        if (!first || !second) return;
        const step = Math.abs(second.offsetLeft - first.offsetLeft) || 1;
        // Right to left scrolls with a negative offset: the distance is what counts.
        setIndex(Math.min(count - 1, Math.max(0, Math.round(Math.abs(rail.scrollLeft) / step))));
      });
    };
    rail.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      rail.removeEventListener("scroll", update);
    };
  }, [count]);
  return { ref, index };
}

export interface BoardViewProps {
  me: { name: string; total: number };
  rank: number | null;
  size: number | null;
  rivals: readonly Rival[];
  notify: boolean;
  onNotify?: (value: boolean) => void;
  notifyBusy?: boolean;
  onUnpin?: (rival: Rival) => void;
  onPin?: (candidate: RivalCandidate) => void;
  candidates: readonly RivalCandidate[];
  candidatesPending?: boolean;
  pinError?: "full" | "failed" | null;
  busy?: boolean;
  max?: number;
  /** Under the locked blur: no actions, no add slot, nothing the reader could press. */
  example?: boolean;
}

/**
 * The board itself, a pure view of what the read returned: the reader's line, the lead-change
 * banner, the posters (paged on a phone, side by side on a wide screen), the dots, the switch for
 * the notification and the four things the feature cannot do.
 */
export function BoardView({
  me,
  rank,
  size,
  rivals,
  notify,
  onNotify,
  notifyBusy = false,
  onUnpin,
  onPin,
  candidates,
  candidatesPending = false,
  pinError = null,
  busy = false,
  max = RIVAL_MAX,
  example = false,
}: BoardViewProps) {
  const { t, text, lang } = usePlusCopy();
  const { t: translate } = useI18n();
  const { ord } = useSeasonFmt();
  const showAdd = !example && rivals.length < max;
  const slides = rivals.length + (showAdd ? 1 : 0);
  const { ref, index } = useRailIndex(slides);
  const change = leadChange(rivals);
  const stamp = rivals[0] ? stampText(translate, lang, rivals[0]) : null;
  const idBase = "plus-rival";

  const goTo = (teamId: string) => {
    const poster = document.getElementById(`${idBase}-${teamId}`);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    poster?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      inline: "start",
      block: "nearest",
    });
  };

  const meLine: ReactNode = (
    <>
      <bdi dir="ltr">{text("plus.rv.pts", { n: me.total })}</bdi>
      {rank !== null && size !== null ? (
        <>
          {" · "}
          <bdi>{text("plus.s2.rank_of", { r: ord(rank), n: size })}</bdi>
        </>
      ) : null}
    </>
  );

  const Shell = example ? ExampleShell : MemberShell;
  return (
    <Shell>
      <div className="pr-board">
        <header className="pr-head">
          <PlusInitials name={me.name} tone="me" small />
          <div className="pr-head-id">
            <h2 className="pr-head-name" id={example ? undefined : "plus-rivals-title"}>
              <bdi>{me.name}</bdi>
            </h2>
            <p>{meLine}</p>
          </div>
          {stamp ? <span className="pr-stamp pr-head-stamp">{stamp}</span> : null}
        </header>

        {change ? (
          <section className="pr-banner" role="status" data-testid="plus-rivals-banner">
            <span className="pr-banner-ic" aria-hidden="true">
              <ArrowLeftRight />
            </span>
            <div className="pr-banner-text">
              <p className="pr-banner-t">
                {text(
                  change.to === "rival"
                    ? "plus.rv.banner_rival"
                    : change.corrected
                      ? "plus.rv.banner_me_corrected"
                      : "plus.rv.banner_me",
                  {
                    name: change.rival.name,
                    a:
                      change.to === "rival"
                        ? (change.rival.last?.rivalTotal ?? 0)
                        : (change.rival.last?.meTotal ?? 0),
                    b:
                      change.to === "rival"
                        ? (change.rival.last?.meTotal ?? 0)
                        : (change.rival.last?.rivalTotal ?? 0),
                  },
                )}
              </p>
              <p className="pr-banner-s">
                {text("plus.rv.banner_sub", {
                  n: change.rival.last?.seq ?? 0,
                  me: change.rival.last?.me ?? 0,
                  rival: change.rival.last?.rival ?? 0,
                })}
              </p>
            </div>
            {!example ? (
              <button
                type="button"
                className="pr-btn pr-btn--link"
                onClick={() => goTo(change.rival.teamId)}
              >
                {t("plus.rv.see_poster")}
              </button>
            ) : null}
          </section>
        ) : null}

        <div
          className="pr-rail"
          ref={ref}
          role="group"
          aria-label={t("plus.rv.title")}
          data-testid="plus-rivals-rail"
        >
          {rivals.map((rival, i) => (
            <PlusRivalPoster
              key={rival.teamId}
              rival={rival}
              meName={me.name}
              index={i}
              example={example}
              onUnpin={onUnpin}
              busy={busy}
              posterId={`${idBase}-${rival.teamId}`}
            />
          ))}
          {showAdd ? (
            <AddCard
              index={rivals.length}
              empty={rivals.length === 0}
              candidates={candidates}
              pending={candidatesPending}
              onPin={onPin}
              error={pinError}
              busy={busy}
            />
          ) : null}
        </div>

        {slides > 1 ? (
          <div className="pr-dots" aria-hidden={example ? true : undefined}>
            {Array.from({ length: slides }, (_, i) => (
              <i
                key={i}
                className={cn(i === index && "pr-dot-on")}
                role="img"
                aria-label={text("plus.rv.dot", { i: i + 1, n: slides })}
              />
            ))}
          </div>
        ) : null}

        <NotifyRow notify={notify} onNotify={onNotify} busy={notifyBusy} example={example} />

        <ul className="pr-foot">
          <li>{t("plus.rv.foot_secret")}</li>
          <li>{t("plus.rv.foot_leave")}</li>
          <li>{t("plus.rv.foot_correct")}</li>
          <li>{t("plus.rv.foot_live")}</li>
          {max <= rivals.length ? <li>{t("plus.rv.foot_full")}</li> : null}
        </ul>
      </div>
    </Shell>
  );
}

/** The member's panel: the night surface, named by its heading. */
function MemberShell({ children }: { children: ReactNode }) {
  return (
    <PlusEmbed
      className="pr-embed"
      data-testid="plus-rivals-member"
      aria-labelledby="plus-rivals-title"
    >
      {children}
    </PlusEmbed>
  );
}

/** Under the locked blur the section's own panel is already there: only the content. */
function ExampleShell({ children }: { children: ReactNode }) {
  return <div className="pr-embed pr-embed--example">{children}</div>;
}

function NotifyRow({
  notify,
  onNotify,
  busy,
  example,
}: {
  notify: boolean;
  onNotify?: (value: boolean) => void;
  busy: boolean;
  example: boolean;
}) {
  const { t } = usePlusCopy();
  return (
    <button
      type="button"
      className="pr-toggle"
      role="switch"
      aria-checked={notify}
      disabled={busy || example || !onNotify}
      onClick={() => onNotify?.(!notify)}
      data-testid="plus-rivals-notify"
    >
      <span className="pr-toggle-t">
        <b>{t("plus.rv.toggle_t")}</b>
        <span>{t("plus.rv.toggle_d")}</span>
      </span>
      <span className="pr-sw" data-on={notify ? "true" : "false"} aria-hidden="true">
        <span className="pr-knob" />
      </span>
    </button>
  );
}

/** The empty place: pick a league mate to follow. */
function AddCard({
  index,
  empty,
  candidates,
  pending,
  onPin,
  error,
  busy,
}: {
  index: number;
  empty: boolean;
  candidates: readonly RivalCandidate[];
  pending: boolean;
  onPin?: (candidate: RivalCandidate) => void;
  error: "full" | "failed" | null;
  busy: boolean;
}) {
  const { t } = usePlusCopy();
  return (
    <article
      className="pr-poster pr-poster--add"
      style={{ ["--i" as string]: index }}
      aria-label={t("plus.rv.add")}
      data-testid="plus-rivals-add"
    >
      <div className="pr-add-mid">
        <span className="pr-add-ring" aria-hidden="true">
          <Plus />
        </span>
        <h3 className="pr-add-t">{t("plus.rv.add")}</h3>
        <p className="pr-add-from">{empty ? t("plus.rv.empty") : t("plus.rv.add_from")}</p>
      </div>
      {pending ? <div className="pl-skeleton" aria-hidden /> : null}
      {!pending && candidates.length === 0 ? (
        <p className="pr-fine pr-add-none">{t("plus.rv.add_none")}</p>
      ) : null}
      <ul className="pr-mates">
        {candidates.map((candidate) => (
          <li key={candidate.teamId}>
            <button
              type="button"
              className="pr-btn pr-btn--mate"
              disabled={busy}
              onClick={() => onPin?.(candidate)}
              data-testid="plus-rivals-candidate"
            >
              <span className="pr-ini pr-ini--small pr-ini--rival" aria-hidden="true">
                {initialsOf(candidate.name)}
              </span>
              <span className="pr-mate-name">
                <bdi>{candidate.name}</bdi>
                <small>
                  <bdi>{candidate.league.name}</bdi>
                </small>
              </span>
              <Plus aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p className="pr-fine pr-add-error" role="alert">
          {error === "full" ? t("plus.rv.foot_full") : t("plus.rv.add_failed")}
        </p>
      ) : null}
    </article>
  );
}
