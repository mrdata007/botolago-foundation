import { Trophy } from "lucide-react";

import type { MateTrophies } from "@/backend/trophies/contracts";
import { fill } from "@/components/manager-card/interpolate";
import { useTrophyCopy } from "@/components/plus/trophy-copy";
import { ui, UiButton, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { PersonName } from "./figures";

/**
 * A league mate's trophy count, at the end of their row in « Les vôtres »: a small chip with the
 * number of trophies they earned and chose to show. Only the trophies, never points, ratings or
 * tiers. A tap opens them read-only (`MateTrophiesSheet`). The button is a 44 px target that sits
 * above the row's stretched link.
 */
export function MateTrophyChip({
  name,
  count,
  onOpen,
}: {
  name: string;
  count: number;
  onOpen: () => void;
}) {
  const c = useTrophyCopy();
  const label =
    count === 1
      ? c.text("plus.tr.mate_chip_one", { name })
      : c.text("plus.tr.mate_chip", { name, n: count });
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      data-testid="curva-mate-trophies"
      className={cn(
        "relative z-10 grid min-h-[var(--ui-tap-min)] min-w-[var(--ui-tap-min)] shrink-0 place-items-center",
        ui.radius.full,
        ui.focus,
      )}
    >
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1 px-2",
          ui.radius.full,
          ui.surface.sunken,
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.tone.ink,
        )}
      >
        <Trophy className="h-4 w-4" aria-hidden />
        <bdi dir="ltr">{count}</bdi>
      </span>
    </button>
  );
}

/** A mate's trophies, read-only: each one's name, its journée and the day its result was published. */
export function MateTrophiesSheet({
  open,
  onOpenChange,
  name,
  mate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  mate: MateTrophies | null;
}) {
  const { t } = useI18n();
  const c = useTrophyCopy();
  return (
    <UiSheet
      open={open}
      onOpenChange={onOpenChange}
      title={fill(t("plus.tr.mate_title"), { name: <PersonName>{name}</PersonName> })}
      description={t("plus.tr.mate_sub")}
    >
      {mate ? (
        <div className="flex flex-col gap-4 px-4 pb-4 pt-5" data-testid="curva-mate-trophies-sheet">
          <p className={cn("text-pretty", ui.text.secondary, ui.tone.muted)}>
            {t("plus.tr.mate_sub")}
          </p>
          <ul className="flex flex-col">
            {mate.trophies.map((trophy, index) => (
              <li
                key={trophy.code}
                className={cn("flex items-center gap-3 py-3", index > 0 && ui.rule.blockStart)}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center",
                    ui.radius.full,
                    ui.surface.sunken,
                    ui.tone.ink,
                  )}
                >
                  <Trophy className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-pretty", ui.text.bodyStrong, ui.tone.default)}>
                    {c.lang === "ar" ? trophy.labelAr : trophy.labelFr}
                  </span>
                  <span className={cn("block text-pretty", ui.text.meta, ui.tone.muted)}>
                    {trophy.gameweekSeq !== null ? `${c.gwLong(trophy.gameweekSeq)} · ` : ""}
                    {c.published(trophy.publishedAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className={cn("text-pretty", ui.text.meta, ui.tone.muted)}>{t("plus.tr.mate_note")}</p>
          <UiButton variant="ghost" onClick={() => onOpenChange(false)}>
            {t("fpl.close")}
          </UiButton>
        </div>
      ) : null}
    </UiSheet>
  );
}
