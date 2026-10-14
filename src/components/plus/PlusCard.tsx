import { useEffect, useState } from "react";

import { activeRenderer } from "@/components/manager-card/active-renderer";
import { ManagerCard } from "@/components/manager-card/ManagerCard";
import type { CardProfile } from "@/components/manager-card/types";
import { useI18n } from "@/i18n/provider";

import type { PlusStyle } from "./plus-copy";

/**
 * The card's width: at most `max`, never closer than 20 px to either edge, and short enough that
 * the screen's other content (`reserved` px: bars, title, selector, button) still fits under it in
 * the window (or in the 860 px frame the offer draws on a wide screen). The card keeps its shape
 * (`aspect` = height ÷ width, exact for the active renderer), so a short phone gets a smaller card
 * rather than a scrolled button.
 */
function useCardWidth(max: number, reserved: number, aspect: number): number {
  const [width, setWidth] = useState(max);
  useEffect(() => {
    const measure = () => {
      const room =
        window.innerWidth >= 640 ? Math.min(860, window.innerHeight - 48) : window.innerHeight;
      const byHeight = (room - reserved) / aspect;
      setWidth(Math.round(Math.max(180, Math.min(max, window.innerWidth - 40, byHeight))));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [max, reserved, aspect]);
  return width;
}

/**
 * The existing `ManagerCard`, as it renders today, with a place for the edition.
 *
 * TODO(lane E, card editions): `edition` is the style the member picked (`holo`, `electric`,
 * `pixel`, `chrome`). Until the editions exist on the shield renderer the card does not change
 * with it; the choice is recorded in `data-edition` on the wrapper, which is the hook (a CSS
 * selector, or a prop to the renderer) lane E uses to draw the frame, foil and motion. The rating
 * and the tier never change with the edition.
 */
export function PlusCard({
  profile,
  width = 312,
  reserved = 384,
  edition = null,
}: {
  profile: CardProfile;
  /** The widest the card may be, CSS px. */
  width?: number;
  /** Height, CSS px, the screen needs around the card (see `useCardWidth`). */
  reserved?: number;
  edition?: PlusStyle | null;
}) {
  const { lang } = useI18n();
  const aspect = activeRenderer.estimateAspect(profile, lang === "ar" ? "ar" : "fr");
  const w = useCardWidth(width, reserved, aspect);
  return (
    <div className="plus-card" data-edition={edition ?? undefined}>
      <ManagerCard profile={profile} width={w} tilt />
    </div>
  );
}
