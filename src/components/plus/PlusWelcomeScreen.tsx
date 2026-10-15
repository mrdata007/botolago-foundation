import type { CardProfile } from "@/components/manager-card/types";

import { PlusCard } from "./PlusCard";
import { styleLabel, usePlusCopy, type PlusStyle } from "./plus-copy";
import { DateText } from "./plus-text";

/**
 * Screen 4, « Votre Saison est ouverte » (sketch `#screen-4`): the card, one access line (the Saison
 * and its end date, « Voir Ma saison »), « Ouvrir ma saison ». Reached only by a member (staff
 * activate the Saison once the payment is checked), never from screen 3 directly; what happens when
 * the Saison ends is told in Profil, not here. The reveal is a CSS animation that
 * `prefers-reduced-motion` turns off.
 */
export function PlusWelcomeScreen({
  profile,
  style,
  periodEnd,
  onOpen,
  onManage,
  onShare,
  titleRef,
}: {
  profile: CardProfile;
  style: PlusStyle;
  periodEnd: Date | null;
  onOpen: () => void;
  onManage: () => void;
  onShare: () => void;
  titleRef: React.Ref<HTMLHeadingElement>;
}) {
  const { t, f } = usePlusCopy();
  return (
    <>
      <div className="plus-body">
        <h1 className="plus-h" id="plus-s4-title" tabIndex={-1} ref={titleRef}>
          {t("plus.s4.title")}
        </h1>
        <p className="plus-lede plus-s4-sub" role="status">
          {t("plus.s4.sub").replace("{style}", styleLabel(t, style))}
        </p>
        <div className="plus-s4-card">
          <PlusCard profile={profile} width={270} reserved={400} edition={style} />
        </div>
        <div className="plus-panel plus-recap">
          <p className="plus-recap-plan">
            <b>{t("plus.season.name")}</b>
            {periodEnd ? (
              <span>{f("plus.s4.access", { date: <DateText date={periodEnd} /> })}</span>
            ) : null}
          </p>
          <button type="button" className="plus-btn plus-btn--text" onClick={onManage}>
            {t("plus.s4.manage")}
          </button>
        </div>
      </div>
      <div className="plus-foot">
        <button type="button" className="plus-btn plus-btn--primary" onClick={onOpen}>
          {t("plus.s4.cta")}
        </button>
        <div>
          <button type="button" className="plus-btn plus-btn--text" onClick={onShare}>
            {t("plus.s4.share")}
          </button>
        </div>
      </div>
    </>
  );
}
