import { Check } from "lucide-react";
import { useState } from "react";

import type { TrophiesCabinet } from "@/backend/trophies/contracts";
import { useChooseFrame } from "@/services/use-trophies";

import { PlusBackButton } from "./TrophyBits";
import { useTrophyCopy } from "./trophy-copy";
import { framesToEarn, shortDate } from "./trophy-model";
import type { TrophyIdentity } from "./trophy-identity";

import "./plus-trophies.css";

/**
 * The frame of the Manager Card: the card on a spotlit pedestal in the frame being picked, the
 * frames the reader earned (a radio group, standard always first), those still to earn with the
 * server's own count, and « Enregistrer ». Members only: the choice is saved by
 * `api.choose_card_frame`, which checks the subscription and the trophy again.
 */
export function TrophyFrames({
  cabinet,
  identity,
  onBack,
  titleRef,
}: {
  cabinet: TrophiesCabinet;
  identity: TrophyIdentity;
  onBack: () => void;
  titleRef: React.Ref<HTMLHeadingElement>;
}) {
  const c = useTrophyCopy();
  const choose = useChooseFrame();
  const [picked, setPicked] = useState(cabinet.chosenFrame);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const earnedFrames = cabinet.frames.filter((f) => f.earned);
  const given = earnedFrames.filter((f) => f.code !== "standard").length;
  const earnedAt = (trophyCode: string | null) => {
    const row = cabinet.earned.find((e) => e.code === trophyCode);
    return row ? shortDate(row.publishedAt, c.lang) : null;
  };
  const save = () => {
    setStatus("idle");
    choose.mutate(picked, {
      onSuccess: () => setStatus("saved"),
      onError: () => setStatus("failed"),
    });
  };

  return (
    <div className="tr-detail" data-testid="trophy-frames">
      <PlusBackButton label={c.t("plus.tr.back")} onClick={onBack} />
      <h2 className="tr-h1" id="plus-trophies-title" tabIndex={-1} ref={titleRef}>
        {given === 1
          ? c.t("plus.tr.frames_title_one")
          : c.text("plus.tr.frames_title", { n: given })}
      </h2>

      <div className="tr-stage">
        <div className="tr-frame" data-frame={picked} data-testid="trophy-frame-preview">
          <div className="tr-minicard">
            {identity.tier ? (
              <span className="tr-minicard__tier">{identity.tier.toUpperCase()}</span>
            ) : null}
            <span className="tr-fig" dir="ltr">
              {identity.ovr ?? "—"}
            </span>
            <span className="tr-card__sub">{c.t("plus.tr.card_note")}</span>
            <span className="tr-minicard__name">
              <bdi>{identity.name}</bdi>
            </span>
            {identity.club ? <span className="tr-minicard__club">{identity.club}</span> : null}
          </div>
        </div>
      </div>

      <div className="tr-tiles" role="radiogroup" aria-label={c.t("plus.tr.frames_sheet")}>
        {earnedFrames.map((frame) => {
          const checked = picked === frame.code;
          const sub =
            frame.code === "standard"
              ? c.t("plus.tr.frame_standard_sub")
              : earnedAt(frame.trophyCode);
          return (
            <button
              key={frame.code}
              type="button"
              role="radio"
              aria-checked={checked}
              className={`tr-tile${frame.code === "standard" ? " tr-tile--standard" : ""}`}
              data-testid={`frame-${frame.code}`}
              onClick={() => {
                setPicked(frame.code);
                setStatus("idle");
              }}
            >
              <span className="tr-tile__swatch tr-frame" data-frame={frame.code}>
                <i />
              </span>
              <span className="tr-tile__text">
                {checked ? (
                  <span className="tr-tile__chosen">
                    <Check aria-hidden />
                    {c.t("plus.tr.frame_chosen")}
                  </span>
                ) : null}
                <span>{c.frameName(frame)}</span>
                {sub ? (
                  <small>
                    {frame.code === "standard"
                      ? sub
                      : c.text("plus.tr.frame_earned", { date: sub })}
                  </small>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {framesToEarn(cabinet).length > 0 ? (
        <>
          <h3 className="tr-section-label">{c.t("plus.tr.to_earn")}</h3>
          <div className="tr-tiles">
            {framesToEarn(cabinet).map(({ frame, progress }) => {
              const share = c.progressShare(progress);
              return (
                <div
                  key={frame.code}
                  className="tr-tile tr-tile--todo"
                  data-testid={`frame-todo-${frame.code}`}
                >
                  <span className="tr-tile__swatch" aria-hidden />
                  <span className="tr-tile__text">
                    <span>{c.frameName(frame)}</span>
                    <small>{c.progressLine(progress)}</small>
                    {share !== null ? (
                      <span className="tr-bar-progress" aria-hidden>
                        <i style={{ inlineSize: `${Math.round(share * 100)}%` }} />
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <p className="tr-rule">{c.t("plus.tr.frames_note")}</p>
      <p className="tr-note">{c.t("plus.tr.frames_free")}</p>
      <button
        type="button"
        className="tr-btn tr-btn--primary"
        onClick={save}
        disabled={choose.isPending || picked === cabinet.chosenFrame}
        data-testid="frames-save"
      >
        {c.t("plus.tr.save")}
      </button>
      <p className="tr-free" role="status" aria-live="polite">
        {status === "saved" ? c.t("plus.tr.saved") : null}
        {status === "failed" ? c.t("plus.tr.save_failed") : null}
      </p>
    </div>
  );
}
