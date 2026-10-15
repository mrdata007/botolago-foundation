import {
  CalendarDays,
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  Trophy,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";

import type { TrophyFamily } from "@/backend/trophies/contracts";

import { useTrophyCopy } from "./trophy-copy";
import { figureOf, type Plaque, type Shelf } from "./trophy-model";

import "./plus-trophies.css";

const FAMILY_ICON: Record<TrophyFamily, typeof Trophy> = {
  paliers: TrendingUp,
  journees: CalendarDays,
  decisions: ArrowLeftRight,
  ligue: BarChart3,
  carte: CreditCard,
};

function FamilyName({ family }: { family: TrophyFamily }) {
  const { t } = useTrophyCopy();
  switch (family) {
    case "paliers":
      return <>{t("plus.tr.fam_paliers")}</>;
    case "journees":
      return <>{t("plus.tr.fam_journees")}</>;
    case "decisions":
      return <>{t("plus.tr.fam_decisions")}</>;
    case "ligue":
      return <>{t("plus.tr.fam_ligue")}</>;
    case "carte":
      return <>{t("plus.tr.fam_carte")}</>;
  }
}

function PlaqueBody({ plaque, isNew }: { plaque: Plaque; isNew: boolean }): ReactNode {
  const c = useTrophyCopy();
  if (plaque.state === "earned") {
    const fig = c.figure(figureOf(plaque.earned));
    const seq = plaque.earned.gameweekSeq;
    return (
      <>
        <span className="tr-plaque__fig" dir="ltr">
          <span className="tr-fig">{fig.big}</span>
          {fig.small ? <span className="tr-plaque__unit">{fig.small}</span> : null}
        </span>
        <span className="tr-plaque__label">{plaque.label}</span>
        <span className="tr-plaque__meta">
          {seq !== null ? <span dir="ltr">{c.gw(seq)}</span> : c.t("plus.tr.cohort")}
          <span className="tr-stamp">{c.published(plaque.earned.publishedAt)}</span>
          {isNew ? <span className="tr-new">{c.t("plus.tr.new")}</span> : null}
        </span>
      </>
    );
  }
  if (plaque.state === "pending") {
    return (
      <>
        <span className="tr-plaque__label">{plaque.label}</span>
        <span className="tr-plaque__meta">
          <span dir="ltr">{c.gw(plaque.pending.gameweekSeq)}</span>
          <span className="tr-pill">{c.t("plus.tr.pending")}</span>
        </span>
        <span className="tr-plaque__meta">
          {c.text("plus.tr.pending_why", { n: plaque.pending.gameweekSeq })}
        </span>
      </>
    );
  }
  const share = c.progressShare(plaque.progress);
  // a league trophy the reader is standing towards: « en cours », never earned before the season ends
  const inProgress = plaque.progress?.unit === "rank" && plaque.progress.have !== null;
  return (
    <>
      <span className="tr-plaque__label">{plaque.label}</span>
      {inProgress ? (
        <span className="tr-plaque__meta">
          <span className="tr-pill">{c.t("plus.tr.in_progress")}</span>
        </span>
      ) : null}
      <span className="tr-plaque__meta">{c.progressLine(plaque.progress)}</span>
      {share !== null ? (
        <span className="tr-bar-progress" aria-hidden>
          <i style={{ inlineSize: `${Math.round(share * 100)}%` }} />
        </span>
      ) : null}
    </>
  );
}

/**
 * The lit glass cabinet: one shelf per family, an earned trophy a mint-lit plaque (a button that
 * opens its detail when `onOpen` is given), the one waiting for a publication dashed and dimmed, the
 * ones still to earn flat silhouettes with a progress bar (the league podium and champion, given at
 * the end of the season, show « en cours » and today's rank instead). Pure: it draws the shelves it
 * is given.
 */
export function TrophyCabinet({
  shelves,
  newest,
  onOpen,
}: {
  shelves: readonly Shelf[];
  /** The code of the trophy to mark « Nouveau ». */
  newest: string | null;
  onOpen?: (code: string) => void;
}) {
  const c = useTrophyCopy();
  return (
    <div className="tr-cabinet" data-testid="trophy-cabinet">
      <div className="tr-shelves">
        {shelves.map((shelf, index) => {
          const Icon = FAMILY_ICON[shelf.family];
          return (
            <section
              key={shelf.family}
              className="tr-shelf"
              style={{ ["--i" as string]: index }}
              aria-labelledby={`tr-shelf-${shelf.family}`}
            >
              <h3 className="tr-shelf__head" id={`tr-shelf-${shelf.family}`}>
                <span>
                  <Icon aria-hidden />
                  <FamilyName family={shelf.family} />
                </span>
                <span className="tr-shelf__count">
                  {c.text("plus.tr.of", { a: shelf.earned, b: shelf.total })}
                </span>
              </h3>
              <div className="tr-plaques">
                {shelf.plaques.map((plaque) => {
                  const isNew = plaque.state === "earned" && plaque.code === newest;
                  const cls = `tr-plaque tr-plaque--${plaque.state}${isNew ? " tr-plaque--new" : ""}`;
                  const interactive = onOpen !== undefined && plaque.state === "earned";
                  const body = <PlaqueBody plaque={plaque} isNew={isNew} />;
                  return interactive ? (
                    <button
                      key={plaque.code}
                      type="button"
                      className={cls}
                      data-testid={`trophy-${plaque.code}`}
                      onClick={() => onOpen(plaque.code)}
                    >
                      {body}
                    </button>
                  ) : (
                    <div key={plaque.code} className={cls} data-testid={`trophy-${plaque.code}`}>
                      {body}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
