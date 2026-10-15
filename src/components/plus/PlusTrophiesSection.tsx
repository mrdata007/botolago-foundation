import { useEffect, useMemo, useRef, useState } from "react";

import type { TrophiesCabinet } from "@/backend/trophies/contracts";
import { useMyTrophies } from "@/services/use-trophies";

import { PlusEmbed, PlusLockedSection } from "./PlusLockedSection";
import type { PlusAccess } from "./plus-access";
import { TrophyCabinet } from "./TrophyCabinet";
import { TrophyDetail } from "./TrophyDetail";
import { TrophyFrames } from "./TrophyFrames";
import { TrophyVisibilitySwitch } from "./TrophyVisibilitySwitch";
import { useTrophyCopy } from "./trophy-copy";
import type { TrophyIdentity } from "./trophy-identity";
import { buildShelves, earnedCount, newestWithin, type Shelf } from "./trophy-model";
import { exampleCabinet } from "./trophy-example";

import "./plus-trophies.css";

/** The address fragment the card page's section answers to. */
export const TROPHIES_SECTION_ID = "trophees";

type View = { kind: "cabinet" } | { kind: "detail"; code: string } | { kind: "frames" };

/**
 * « Trophées » on Curva's card page (BotolaGO+, « La vitrine éclairée »). The card page's slot decides
 * `access` (`usePlusAccess()`):
 *   - off: null (no node, no request);
 *   - locked (signed in, not a member): the trophies the reader earned, clear and listed (they are
 *     earned by playing, by everyone), the cabinet blurred below with « Découvrir »;
 *   - member: the lit cabinet, each trophy's detail with its share card, and the frame picker.
 * A trophy is never taken back: the screens only ever show what the database returned.
 */
export function PlusTrophiesSection({
  access,
  identity,
}: {
  access: PlusAccess;
  identity: TrophyIdentity;
}) {
  if (access === "off") return null;
  return <TrophiesBody access={access} identity={identity} />;
}

function TrophiesBody({
  access,
  identity,
}: {
  access: Exclude<PlusAccess, "off">;
  identity: TrophyIdentity;
}) {
  const c = useTrophyCopy();
  const query = useMyTrophies(true);
  const cabinet = query.data ?? null;
  const [view, setView] = useState<View>({ kind: "cabinet" });
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shown = useRef<View>(view);
  useEffect(() => {
    // move focus to the new view's heading, but only when the reader changed the view
    if (
      shown.current.kind !== view.kind ||
      JSON.stringify(shown.current) !== JSON.stringify(view)
    ) {
      shown.current = view;
      titleRef.current?.focus();
    }
  }, [view]);

  // Nothing to say while it loads in silence for a non-member; a member sees a skeleton.
  if (query.isPending) {
    return access === "member" ? (
      <PlusEmbed id={TROPHIES_SECTION_ID} data-testid="plus-trophies-member">
        <div className="pl-skeleton" aria-hidden />
        <span className="sr-only">{c.t("plus.tr.loading")}</span>
      </PlusEmbed>
    ) : null;
  }
  if (query.isError) {
    return (
      <PlusEmbed id={TROPHIES_SECTION_ID} data-testid="plus-trophies-member">
        <p className="pl-note">{c.t("plus.tr.failed")}</p>
      </PlusEmbed>
    );
  }
  // `{ available: false }`: the feature is off for this reader after all.
  if (!cabinet) return null;
  return access === "locked" || !cabinet.member ? (
    <LockedTrophies cabinet={cabinet} />
  ) : (
    <PlusEmbed
      id={TROPHIES_SECTION_ID}
      data-testid="plus-trophies-member"
      aria-labelledby="plus-trophies-title"
    >
      <MemberTrophies
        cabinet={cabinet}
        identity={identity}
        view={view}
        setView={setView}
        titleRef={titleRef}
      />
    </PlusEmbed>
  );
}

function useCabinetModel(cabinet: TrophiesCabinet) {
  const c = useTrophyCopy();
  const shelves = useMemo(() => buildShelves(cabinet, c.lang), [cabinet, c.lang]);
  const newest = useMemo(() => newestWithin(cabinet, new Date()), [cabinet]);
  return { shelves, newest };
}

function Headline({ cabinet, name }: { cabinet: TrophiesCabinet; name: string }) {
  const c = useTrophyCopy();
  const n = earnedCount(cabinet);
  const pending = cabinet.pending.length;
  const base =
    n === 0
      ? c.text("plus.tr.headline_none", { name })
      : n === 1
        ? c.text("plus.tr.headline_one", { name })
        : c.text("plus.tr.headline_many", { name, n });
  return (
    <>{pending > 0 && n > 0 ? base + c.text("plus.tr.headline_pending", { p: pending }) : base}</>
  );
}

function Kicker({ cabinet }: { cabinet: TrophiesCabinet }) {
  const c = useTrophyCopy();
  if (!cabinet.season) return null;
  return (
    <p className="tr-kicker">
      {cabinet.journeesPlayed > 0
        ? c.text("plus.tr.kicker", { season: cabinet.season.label, n: cabinet.journeesPlayed })
        : c.text("plus.tr.kicker_season", { season: cabinet.season.label })}
    </p>
  );
}

function Rule() {
  const c = useTrophyCopy();
  return (
    <div className="tr-rule" data-testid="trophy-rule">
      <p>{c.t("plus.tr.rule")}</p>
      <ul>
        <li>{c.t("plus.tr.rule_tier")}</li>
        <li>{c.t("plus.tr.rule_kept")}</li>
        <li>{c.t("plus.tr.rule_season_end")}</li>
        <li>{c.t("plus.tr.rule_founder")}</li>
        <li>{c.t("plus.tr.rule_nomoney")}</li>
      </ul>
    </div>
  );
}

function MemberTrophies({
  cabinet,
  identity,
  view,
  setView,
  titleRef,
}: {
  cabinet: TrophiesCabinet;
  identity: TrophyIdentity;
  view: View;
  setView: (view: View) => void;
  titleRef: React.Ref<HTMLHeadingElement>;
}) {
  const c = useTrophyCopy();
  const { shelves, newest } = useCabinetModel(cabinet);
  const back = () => setView({ kind: "cabinet" });
  if (view.kind === "detail") {
    const earned = cabinet.earned.find((e) => e.code === view.code);
    if (earned)
      return (
        <div className="plus-trophies">
          <TrophyDetail
            cabinet={cabinet}
            earned={earned}
            identity={identity}
            onBack={back}
            onFrames={() => setView({ kind: "frames" })}
            titleRef={titleRef}
          />
        </div>
      );
  }
  if (view.kind === "frames") {
    return (
      <div className="plus-trophies">
        <TrophyFrames cabinet={cabinet} identity={identity} onBack={back} titleRef={titleRef} />
      </div>
    );
  }
  return (
    <div className="plus-trophies">
      <header>
        <Kicker cabinet={cabinet} />
        <h2 className="tr-h1" id="plus-trophies-title" tabIndex={-1} ref={titleRef}>
          <Headline cabinet={cabinet} name={identity.name} />
        </h2>
      </header>
      {cabinet.earned.length === 0 ? <p className="tr-note">{c.t("plus.tr.empty")}</p> : null}
      <TrophyCabinet
        shelves={shelves}
        newest={newest}
        onOpen={(code) => setView({ kind: "detail", code })}
      />
      <Rule />
      <TrophyVisibilitySwitch cabinet={cabinet} />
      <div className="tr-actions">
        <button
          type="button"
          className="tr-btn tr-btn--primary"
          disabled={cabinet.earned.length === 0}
          onClick={() => {
            const latest = [...cabinet.earned].sort((a, b) =>
              b.earnedAt.localeCompare(a.earnedAt),
            )[0];
            if (latest) setView({ kind: "detail", code: latest.code });
          }}
          data-testid="trophies-share"
        >
          {c.t("plus.tr.share")}
        </button>
        <button
          type="button"
          className="tr-btn"
          onClick={() => setView({ kind: "frames" })}
          data-testid="trophies-frames"
        >
          {c.t("plus.tr.frame_pick")}
        </button>
      </div>
    </div>
  );
}

/** Not a member: the reader's own trophies as a clear list, the cabinet an example under the blur. */
function LockedTrophies({ cabinet }: { cabinet: TrophiesCabinet }) {
  const c = useTrophyCopy();
  const example = useMemo(() => exampleCabinet(cabinet.catalog), [cabinet.catalog]);
  const exampleShelves: Shelf[] = useMemo(() => buildShelves(example, c.lang), [example, c.lang]);
  const frames = cabinet.frames.filter((f) => f.earned && f.code !== "standard").length;
  return (
    <PlusLockedSection
      id={TROPHIES_SECTION_ID}
      testId="plus-trophies-locked"
      headline={c.t("plus.tr.locked_headline")}
      via="editions"
      head={
        <div className="plus-trophies tr-locked-head">
          <span className="tr-pill">{c.t("plus.tr.locked_tag")}</span>
          {cabinet.earned.length > 0 ? (
            <ul className="tr-rows" data-testid="trophies-list">
              {cabinet.earned.map((e) => (
                <li key={e.code} className="tr-row">
                  <span>{c.lang === "ar" ? e.labelAr : e.labelFr}</span>
                  <small>
                    {e.gameweekSeq !== null ? (
                      <span dir="ltr">{c.gw(e.gameweekSeq)} · </span>
                    ) : null}
                    {c.published(e.publishedAt)}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tr-note">{c.t("plus.tr.empty")}</p>
          )}
          {cabinet.pending.map((p) => (
            <p key={p.code} className="tr-note">
              <span className="tr-pill">{c.t("plus.tr.pending")}</span>{" "}
              {c.text("plus.tr.pending_why", { n: p.gameweekSeq })}
            </p>
          ))}
          {frames > 0 ? (
            <p className="tr-free">{c.text("plus.tr.frames_locked", { n: frames })}</p>
          ) : null}
          <TrophyVisibilitySwitch cabinet={cabinet} />
        </div>
      }
    >
      <div className="plus-trophies">
        <TrophyCabinet shelves={exampleShelves} newest={null} />
      </div>
    </PlusLockedSection>
  );
}
