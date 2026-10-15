import type { TrophiesCabinet } from "@/backend/trophies/contracts";

import { useTrophyCopy } from "./trophy-copy";
import { useTrophyVisibilitySwitch } from "./use-trophy-visibility";

import "./plus-trophies.css";

/**
 * « Montrer mes trophées » on the trophies page (on by default). On: the managers of the reader's
 * private Fantasy leagues see the trophies the reader earned this season. Never points, ratings or
 * tiers, never to strangers, never in a public league. It sits inside `.plus-trophies`, which
 * carries the palette.
 */
export function TrophyVisibilitySwitch({ cabinet }: { cabinet: TrophiesCabinet }) {
  const c = useTrophyCopy();
  const { on, pending, flip } = useTrophyVisibilitySwitch(cabinet.showToLeagues);
  return (
    <div className="tr-vis" data-testid="trophies-visibility">
      <span className="tr-vis__text">
        <span className="tr-vis__label" id="tr-vis-label">
          {c.t("plus.tr.vis_label")}
        </span>
        <span className="tr-vis__hint" id="tr-vis-hint">
          {c.t("plus.tr.vis_hint")}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="tr-vis-label"
        aria-describedby="tr-vis-hint"
        disabled={pending}
        onClick={flip}
        className="tr-switch"
        data-testid="trophies-visibility-switch"
      >
        <span className="tr-switch__track" aria-hidden>
          <span className="tr-switch__knob" />
        </span>
      </button>
    </div>
  );
}
