import { useState } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiPitchSurface, UiPlayerPlate } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  DEMO_DEFAULT_CAPTAIN,
  DEMO_KITS as KITS,
  DEMO_ROWS,
  type DemoPosition as Position,
  type DemoSlot,
} from "./demo-squad";

/**
 * The landing page's product shot: the real pitch (`UiPitchSurface`), plates
 * (`UiPlayerPlate`) and shirts (`JerseyVisual`) the builder draws, holding a
 * demonstration XI — and the one interaction that explains the game best,
 * moving the captain's armband, works on it.
 *
 * Nothing on it claims to be real. The shirts wear generic colours, not a
 * club's kit; the plates name a position and a shirt number, not a player;
 * there are no prices and no points. It says "Démonstration" on its face.
 */

/** One literal call per position: the i18n gate reads keys statically. */
function positionName(position: Position, t: (key: TranslationKey) => string): string {
  switch (position) {
    case "gk":
      return t("pepites.position.gk");
    case "def":
      return t("pepites.position.def");
    case "mid":
      return t("pepites.position.mid");
    case "fwd":
      return t("pepites.position.fwd");
  }
}

export function DemoPitch({ className }: { className?: string }) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const [captain, setCaptain] = useState(DEMO_DEFAULT_CAPTAIN);
  const label = (slot: DemoSlot) => `${positionName(slot.position, t)} ${nf.format(slot.number)}`;
  const captainSlot = DEMO_ROWS.flat().find((slot) => slot.id === captain);

  const rows = DEMO_ROWS.map((row) =>
    row.map((slot) => {
      const isCaptain = slot.id === captain;
      return (
        <UiPlayerPlate
          key={slot.id}
          name={<span className="ltr:tracking-tight">{positionName(slot.position, t)}</span>}
          sub={
            isCaptain ? (
              <span className="[font-weight:var(--ui-weight-heavy)]">×{nf.format(2)}</span>
            ) : (
              nf.format(slot.number)
            )
          }
          state={isCaptain ? "selected" : "default"}
          onClick={() => setCaptain(slot.id)}
          ariaLabel={t("landing.demo_make_captain").replace("{player}", label(slot))}
          visual={
            <span className="relative mb-1 block">
              <JerseyVisual kit={KITS[slot.kit]} size={42} variant="flat" />
              {isCaptain ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute -end-2 -top-1 grid h-5 w-5 place-items-center motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200",
                    ui.radius.full,
                    ui.text.micro,
                    "[font-weight:var(--ui-weight-heavy)]",
                    "text-[color:var(--ui-ink-deep)] shadow-[var(--ui-shadow-card)]",
                  )}
                  style={{ backgroundImage: "var(--ui-grad-action)" }}
                >
                  {t("fantasy.captain")}
                </span>
              ) : null}
            </span>
          }
        />
      );
    }),
  );

  return (
    <figure
      className={cn("relative", className)}
      aria-label={t("landing.demo_label")}
      data-testid="landing-demo-pitch"
    >
      <div
        className={cn(
          "overflow-hidden",
          ui.radius.sheet,
          "bg-[color:var(--ui-pitch-bench)] shadow-[var(--ui-shadow-lifted)]",
        )}
      >
        <UiPitchSurface rows={rows} />
      </div>
      {/* On the pitch's face, so a screenshot of it carries the label too. */}
      <span
        className={cn(
          "absolute start-3 top-3 px-2.5 py-1",
          ui.radius.full,
          ui.text.micro,
          "[font-weight:var(--ui-weight-heavy)] uppercase ltr:tracking-wide",
          "bg-[color:var(--ui-ink-deep)] text-[color:var(--ui-on-ink-plain)]",
        )}
      >
        {t("landing.demo_badge")}
      </span>
      <figcaption
        className={cn("mt-3 text-center text-balance", ui.text.meta, ui.tone.onMeshMuted)}
      >
        {t("landing.demo_caption")}
      </figcaption>
      {/* The armband's move, said for whoever cannot see it. */}
      <p className="sr-only" aria-live="polite">
        {captainSlot && captain !== DEMO_DEFAULT_CAPTAIN
          ? t("landing.demo_captain_now").replace("{player}", label(captainSlot))
          : ""}
      </p>
    </figure>
  );
}
