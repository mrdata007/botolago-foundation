import { ui, UiButton } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import type { ChipKey } from "@/lib/fantasy-engine";
import { cn } from "@/lib/utils";

/**
 * Each chip under the name the chips row already gives it. Literal keys, one
 * per chip, so the i18n gate can see every key this reads.
 */
function chipName(chip: ChipKey, t: (key: TranslationKey) => string): string {
  switch (chip) {
    case "bench_boost":
      return t("fantasy.chip.bench_boost");
    case "free_hit":
      return t("fantasy.chip.free_hit");
    case "triple_captain":
      return t("fantasy.chip.triple_captain");
    case "wildcard":
      return t("fantasy.chip.wildcard");
  }
}

/**
 * What the bar says is waiting. A chip played but not confirmed is named
 * first, because that is what "Confirmer" sends first (`onConfirm` confirms a
 * pending chip before a line-up). When the line-up, captaincy or bench order
 * has changed too, the bar says so as well: "Annuler" drops both, and the
 * line-up still waits after the chip is confirmed.
 */
function pendingStatus(
  pendingChip: ChipKey | null,
  lineupDirty: boolean,
  t: (key: TranslationKey) => string,
): string {
  if (!pendingChip) return t("fantasy.team.unsaved.status");
  const chip = t("fantasy.team.unsaved.chip").replace("{chip}", chipName(pendingChip, t));
  return lineupDirty ? `${chip} · ${t("fantasy.team.unsaved.status")}` : chip;
}

/**
 * BG-0155 (1) — Pick Team's confirmation bar.
 *
 * While a line-up, captain or chip change is pending, the screen's one
 * "Confirmer" lives here, in thumb reach, instead of in the header, which
 * scrolls away with the page: changing the captain and scrolling to the
 * bench left it 158px above the window.
 *
 * The Transfers confirmation bar's pattern (`TransferConfirmScreen`): the bar
 * surface with a top hairline and the raised shadow, sticking just above the
 * bottom navigation on a phone and to the window's foot from `md` (the frame
 * passes `stickyBottomBar`, so the column does not become a scroll box). It
 * is rendered at the end of the page content, so it sticks while the pitch
 * scrolls under it and rests in flow under the bench at the end. The status
 * line comes first, then Annuler (soft) and Confirmer (ink) side by side.
 */
export function PickTeamConfirmBar({
  pendingChip,
  lineupDirty,
  saving,
  onCancel,
  onConfirm,
}: {
  pendingChip: ChipKey | null;
  /** The line-up, captaincy or bench order has changed and is not saved. */
  lineupDirty: boolean;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      data-testid="pick-team-confirm-bar"
      className={cn(
        "sticky bottom-[var(--bottomnav-h)] z-30 mt-6 pb-2.5 pt-2.5 md:bottom-0 md:pb-[max(env(safe-area-inset-bottom),0.75rem)]",
        ui.space.gutter,
        ui.surface.bar,
        ui.rule.blockStart,
        ui.shadow.raised,
      )}
    >
      <p
        role="status"
        aria-live="polite"
        className={cn(
          // Balanced, so a chip and a line-up change both waiting break at
          // their " · " rather than inside "Modifications non enregistrées".
          "text-balance pb-2.5 text-center",
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.tone.default,
        )}
      >
        {pendingStatus(pendingChip, lineupDirty, t)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <UiButton variant="soft" onClick={onCancel} disabled={saving}>
          {t("fpl.cancel")}
        </UiButton>
        <UiButton variant="ink" onClick={onConfirm} disabled={saving}>
          {saving ? t("fpl.saving") : t("fpl.confirm")}
        </UiButton>
      </div>
    </div>
  );
}
