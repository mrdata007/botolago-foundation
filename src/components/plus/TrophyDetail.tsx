import { Link } from "@tanstack/react-router";
import { Check, ImageDown, Trophy } from "lucide-react";
import { useMemo, useState } from "react";

import { ShareImageSheet } from "@/components/common/ShareImageSheet";
import type { EarnedTrophy, TrophiesCabinet } from "@/backend/trophies/contracts";

import { PlusBackButton } from "./TrophyBits";
import { useTrophyCopy } from "./trophy-copy";
import { figureOf } from "./trophy-model";
import {
  FRAME_COLOURS,
  renderTrophyImage,
  type TrophyImageFormat,
  type TrophyImageModel,
} from "./trophy-share-image";
import type { TrophyIdentity } from "./trophy-identity";

import "./plus-trophies.css";

/** The line under the label: the two players of a transfer, else the journée. */
export function subLine(earned: EarnedTrophy, gwLong: (n: number) => string): string {
  const out = earned.facts.playerOut;
  const into = earned.facts.playerIn;
  if (typeof out === "string" && typeof into === "string") return `${out} → ${into}`;
  return earned.gameweekSeq !== null ? gwLong(earned.gameweekSeq) : "";
}

/**
 * One trophy: its headline, the day its result was published, who earned it, and the share card
 * (the standard image is free for everyone; a member can add their frame and the story format).
 */
export function TrophyDetail({
  cabinet,
  earned,
  identity,
  onBack,
  onFrames,
  titleRef,
}: {
  cabinet: TrophiesCabinet;
  earned: EarnedTrophy;
  identity: TrophyIdentity;
  onBack: () => void;
  onFrames: () => void;
  titleRef: React.Ref<HTMLHeadingElement>;
}) {
  const c = useTrophyCopy();
  const member = cabinet.member;
  const frameCode = cabinet.frame;
  const canFrame = member && frameCode !== "standard";
  const [framed, setFramed] = useState(true);
  const [format, setFormat] = useState<TrophyImageFormat>("post");
  const label = c.lang === "ar" ? earned.labelAr : earned.labelFr;
  const fig = c.figure(figureOf(earned));
  const sub = subLine(earned, c.gwLong);
  const frameName = c.frameName(
    cabinet.frames.find((f) => f.code === frameCode) ?? cabinet.frames[0]!,
  );
  const who = identity.club ? `${identity.name} · ${identity.club}` : identity.name;
  const shownFrame = canFrame && framed ? frameCode : "standard";
  const season = cabinet.season?.label ?? "";

  const headline =
    typeof earned.facts.playerOut === "string"
      ? c.text("plus.tr.detail_headline", {
          label,
          what: `${sub}, ${fig.big} ${fig.small}`.trim(),
        })
      : earned.gameweekSeq !== null
        ? c.text("plus.tr.detail_headline_plain", { label, n: earned.gameweekSeq })
        : label;

  const model: TrophyImageModel = useMemo(
    () => ({
      format: member ? format : "post",
      rtl: c.lang === "ar",
      kicker: c.text("plus.tr.detail_kicker", { season }),
      figure: fig.big,
      unit: fig.small,
      label,
      sub,
      stamp: c.published(earned.publishedAt),
      who,
      footer: c.t("plus.tr.share_footer"),
      frame: shownFrame !== "standard" ? (FRAME_COLOURS[shownFrame] ?? null) : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      member,
      format,
      c.lang,
      season,
      fig.big,
      fig.small,
      label,
      sub,
      earned.publishedAt,
      who,
      shownFrame,
    ],
  );

  return (
    <div className="tr-detail" data-testid="trophy-detail">
      <PlusBackButton label={c.t("plus.tr.back")} onClick={onBack} />
      <h2 className="tr-h1" id="plus-trophies-title" tabIndex={-1} ref={titleRef}>
        {headline}
      </h2>
      <p>
        <span className="tr-pill tr-stamp">{c.published(earned.publishedAt)}</span>
      </p>
      <p className="tr-who">
        <bdi>{who}</bdi>
        <span>{c.text("plus.tr.detail_of", { n: cabinet.earned.length })}</span>
      </p>

      <div className="tr-share-stage">
        <div className="tr-frame" data-frame={shownFrame} data-testid="trophy-card-frame">
          <div className={`tr-card${model.format === "story" ? " tr-card--story" : ""}`}>
            <span className="tr-card__kicker">{model.kicker}</span>
            <Trophy aria-hidden width={40} height={40} color="oklch(0.86 0.17 152)" />
            <span className="tr-fig" dir="ltr">
              {fig.big}
            </span>
            <span className="tr-card__sub">{fig.small}</span>
            <span className="tr-card__label">{label}</span>
            <span className="tr-card__sub">{sub}</span>
            <span className="tr-card__sub">{model.stamp}</span>
            <span className="tr-card__foot">{model.footer}</span>
          </div>
        </div>
      </div>

      {member ? (
        <div className="tr-chips" role="group" aria-label={c.t("plus.tr.frame_pick")}>
          {canFrame ? (
            <>
              <button
                type="button"
                className="tr-chip"
                aria-pressed={!framed}
                onClick={() => setFramed(false)}
              >
                {!framed ? <Check aria-hidden /> : null}
                {c.t("plus.tr.chip_standard")}
              </button>
              <button
                type="button"
                className="tr-chip"
                aria-pressed={framed}
                onClick={() => setFramed(true)}
              >
                {framed ? <Check aria-hidden /> : null}
                {c.text("plus.tr.chip_framed", { name: frameName })}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="tr-chip"
            aria-pressed={format === "post"}
            onClick={() => setFormat("post")}
          >
            {format === "post" ? <Check aria-hidden /> : null}
            {c.t("plus.tr.chip_post")}
          </button>
          <button
            type="button"
            className="tr-chip"
            aria-pressed={format === "story"}
            onClick={() => setFormat("story")}
          >
            {format === "story" ? <Check aria-hidden /> : null}
            {c.t("plus.tr.chip_story")}
          </button>
        </div>
      ) : null}

      <div className="tr-actions">
        <ShareImageSheet
          label={c.t("plus.tr.share")}
          render={() => renderTrophyImage(model)}
          renderKey={JSON.stringify(model)}
          imageAlt={c.text("plus.tr.share_alt", { label })}
          aspect={model.format === "story" ? "story" : "post"}
          fileName={`trophee-${earned.code}.png`}
          message={c.text("plus.tr.share_message", { label })}
          path="/curva/carte"
          testId="trophy-share"
          campaign="trophy"
          testIdPrefix="trophy"
          trigger={(open) => (
            <button
              type="button"
              className="tr-btn tr-btn--primary"
              onClick={open}
              data-testid="trophy-share"
            >
              <ImageDown aria-hidden />
              {c.t("plus.tr.share")}
            </button>
          )}
        />
        {member ? (
          <button
            type="button"
            className="tr-btn"
            onClick={onFrames}
            data-testid="trophy-frames-open"
          >
            {c.t("plus.tr.frame_pick")}
          </button>
        ) : (
          <Link
            to="/curva/plus"
            search={{ step: 3, via: "editions" }}
            className="tr-btn"
            data-testid="trophy-frame-unlock"
          >
            {c.t("plus.tr.with_frame")} · {c.t("plus.in.unlock")}
          </Link>
        )}
      </div>
      <p className="tr-free">{c.t("plus.tr.detail_free")}</p>
      <p className="tr-note">{c.t("plus.tr.detail_note")}</p>
    </div>
  );
}
