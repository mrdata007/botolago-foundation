import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";

import { ui, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { ChipKey } from "@/lib/fantasy-engine";
import { cn } from "@/lib/utils";
import { chipDescription } from "./chip-copy";

/**
 * The "i" beside a chip's name. A tap opens a small popup — the chip's name
 * and one line on what it does — and a tap anywhere else closes it. Used
 * wherever chips are listed: the row above the Pick Team pitch, the transfer
 * confirmation and the team profile.
 *
 * The glyph is 16px but the control is the kit's 44px round button; the
 * negative inline margin gives most of that width back to its neighbours, so
 * the "i" sits close to the name without shrinking its hit area.
 *
 * Radix directly, on the kit's overlay surface, as `UiMenu` does: the
 * `@/components/ui/popover` wrapper carries the V1 palette. `align="center"`
 * because `start` / `end` are physical edges to the positioning engine and
 * would land on the wrong side in Arabic.
 */
export function FplChipInfo({
  chip,
  label,
  className,
}: {
  chip: ChipKey;
  /** The chip's name, as the caller already renders it. */
  label: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <UiIconButton
          variant="ghost"
          aria-label={t("fantasy.chip.info").replace("{chip}", label)}
          className={cn("-mx-2.5 [&_svg]:h-4 [&_svg]:w-4", className)}
        >
          <Info aria-hidden />
        </UiIconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={4}
          collisionPadding={16}
          aria-label={label}
          className={cn(
            "z-50 w-max max-w-64 px-3.5 py-3 outline-none",
            ui.surface.overlay,
            ui.radius.track,
            ui.rule.all,
          )}
        >
          <p className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]", ui.tone.default)}>
            {label}
          </p>
          <p className={cn("mt-0.5", ui.text.meta, ui.tone.muted)}>{chipDescription(chip, t)}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
