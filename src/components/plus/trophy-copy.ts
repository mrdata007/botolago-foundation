import type { CardFrame, TrophyProgress } from "@/backend/trophies/contracts";

import { usePlusCopy } from "./plus-copy";
import { shortDate, type Figure } from "./trophy-model";

/** The words of the Trophées screens: literal dictionary keys only, so the i18n gate can see them. */
export function useTrophyCopy() {
  const { t, text, lang } = usePlusCopy();

  const published = (iso: string) => text("plus.tr.published", { date: shortDate(iso, lang) });
  const gw = (n: number) => text("plus.tr.gw", { n });
  const gwLong = (n: number) => text("plus.tr.gw_long", { n });
  const rank = (n: number) => (n === 1 ? t("plus.tr.rank_first") : text("plus.tr.rank_nth", { n }));
  const unit = (u: "rating" | "pts" | "gameweeks" | null): string => {
    switch (u) {
      case "rating":
        return t("plus.tr.unit_rating");
      case "pts":
        return t("plus.tr.unit_pts");
      case "gameweeks":
        return t("plus.tr.unit_gameweeks");
      default:
        return "";
    }
  };
  /** The big figure and its small line, as two strings. */
  const figure = (f: Figure): { big: string; small: string } => {
    if (f.kind === "rank")
      return { big: rank(f.rank), small: f.of > 0 ? text("plus.tr.rank_of", { n: f.of }) : "" };
    if (f.kind === "year") return { big: f.big, small: "" };
    return { big: f.big, small: unit(f.unit) };
  };
  /** How far the reader is from a trophy still to earn, as a sentence; null when there is nothing to count. */
  const progressLine = (p: TrophyProgress | null): string => {
    if (!p) return t("plus.tr.not_yet");
    switch (p.unit) {
      case "gameweeks":
        return text("plus.tr.prog_gameweeks", { have: p.have ?? 0, need: p.need ?? 0 });
      case "points":
        return p.have === null
          ? text("plus.tr.prog_points_none", { need: p.need ?? 0 })
          : text("plus.tr.prog_points", { have: p.have, need: p.need ?? 0 });
      case "rating":
        // a manager without a rating reads « sans note », never a number
        return p.have === null
          ? text("plus.tr.prog_rating_none", { need: p.need ?? 0 })
          : text("plus.tr.prog_rating", { have: p.have, need: p.need ?? 0 });
      default:
        return t("plus.tr.not_yet");
    }
  };
  const progressShare = (p: TrophyProgress | null): number | null =>
    p && p.have !== null && p.need ? Math.max(0, Math.min(1, p.have / p.need)) : null;
  const frameName = (frame: CardFrame) => (lang === "ar" ? frame.labelAr : frame.labelFr);
  return {
    t,
    text,
    lang,
    published,
    gw,
    gwLong,
    rank,
    unit,
    figure,
    progressLine,
    progressShare,
    frameName,
  };
}
