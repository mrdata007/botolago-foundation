import { ArrowLeft, ArrowRight } from "lucide-react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import type { ChipKey, ChipState } from "@/lib/fantasy-engine";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer } from "@/types/fantasy";
import { FplBanner, FplButton, FplHeader, FplKeyValueRow } from "./primitives";

/**
 * FPL-007 transfer confirmation: ink banner, Out / In columns, activation
 * note, "Points Overview" rows, the Wildcard / Free Hit chip buttons and the
 * "Edit Transfers | Confirm" bottom bar.
 */
export function TransferConfirmScreen({
  pairs,
  clubs,
  gameweek,
  freeUsed,
  paidUsed,
  hitPoints,
  bankAfter,
  chips,
  onChip,
  onEdit,
  onConfirm,
  busy,
}: {
  pairs: Array<{ out: FantasyPlayer; in: FantasyPlayer }>;
  clubs: Club[];
  gameweek: number;
  freeUsed: number;
  paidUsed: number;
  hitPoints: number;
  bankAfter: number;
  chips: Array<{ key: ChipKey; state: ChipState }>;
  onChip?: (key: ChipKey) => void;
  onEdit: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const clubOf = (id: string) => clubs.find((c) => c.id === id);
  const tile = (player: FantasyPlayer) => {
    const club = clubOf(player.clubId);
    return (
      <div className="flex min-w-0 items-center gap-2">
        <JerseyVisual
          kit={getKitForClub(club, player.kitPattern)}
          size={30}
          imageUrl={player.jerseyImageUrl}
        />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-extrabold text-foreground">
            {tr(player.name)}
          </div>
          <div className="truncate text-[11px] text-[color:var(--fpl-grey-text)]">
            {club ? tr(club.shortName) : ""}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-[calc(100dvh-0px)] flex-col">
      <FplHeader title={t("fpl.transfers")} onBack={onEdit} />
      <FplBanner>
        {pairs.length === 1
          ? t("fpl.about_to_transfer_one")
          : t("fpl.about_to_transfer").replace("{n}", String(pairs.length))}
      </FplBanner>

      <section className="mx-3 mt-3 rounded-[6px] bg-white p-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2 border-b border-[color:var(--fpl-grey)] pb-2 text-center text-[14px] font-extrabold text-foreground">
          <span>{t("fpl.transfer_out")}</span>
          <span>{t("fpl.transfer_in")}</span>
        </div>
        <ul className="divide-y divide-[color:var(--fpl-grey)]">
          {pairs.map((pair) => (
            <li
              key={pair.out.id + pair.in.id}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2"
            >
              <div className="flex items-center gap-1">
                <ArrowLeft className="h-4 w-4 shrink-0 text-[color:var(--fpl-pink)]" aria-hidden />
                {tile(pair.out)}
              </div>
              <span aria-hidden className="text-[color:var(--fpl-grey)]">
                |
              </span>
              <div className="flex items-center gap-1">
                {tile(pair.in)}
                <ArrowRight className="h-4 w-4 shrink-0 text-[oklch(0.72_0.19_150)]" aria-hidden />
              </div>
            </li>
          ))}
        </ul>
        <p className="pt-3 text-center text-[13px] text-foreground">
          {t("fpl.transfers_active_note").replace("{n}", String(gameweek))}
        </p>
      </section>

      <section className="mx-3 mt-auto rounded-[6px] bg-white p-3 pt-4 shadow-sm">
        <h2 className="text-[16px] font-extrabold text-foreground">{t("fpl.points_overview")}</h2>
        <FplKeyValueRow label={t("fpl.free_transfers_used")} value={freeUsed} />
        <FplKeyValueRow
          label={t("fpl.additional_transfers_used")}
          value={`${paidUsed} (${hitPoints}pts)`}
        />
        <FplKeyValueRow
          label={t("fpl.left_in_bank")}
          value={nf.format(bankAfter)}
          className="border-b-0"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {chips.map((chip) => {
            const label = t(`fantasy.chip.${chip.key}` as never);
            const stateLabel =
              chip.state === "active"
                ? t("fpl.state.active")
                : chip.state === "available"
                  ? t("fpl.state.play")
                  : chip.state === "used"
                    ? t("fpl.state.used")
                    : t("fpl.state.unavailable");
            const enabled = chip.state === "available" && !!onChip;
            return (
              <button
                key={chip.key}
                type="button"
                disabled={!enabled}
                onClick={() => onChip?.(chip.key)}
                className={cn(
                  "min-h-12 rounded-[6px] px-2 text-[13px] font-extrabold",
                  chip.state === "active"
                    ? "text-[color:var(--fpl-ink-deep)]"
                    : chip.state === "available"
                      ? "bg-[color:var(--fpl-ink)] text-white"
                      : "bg-[color:var(--fpl-grey)] text-[color:var(--fpl-grey-text)]",
                )}
                style={chip.state === "active" ? { backgroundImage: "var(--fpl-grad)" } : undefined}
              >
                {label} · {stateLabel}
              </button>
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-0 z-30 mt-4 grid grid-cols-2 gap-2 bg-[color:var(--fpl-bg)]/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur">
        <FplButton variant="secondary" onClick={onEdit} disabled={busy}>
          {t("fpl.edit_transfers")}
        </FplButton>
        <FplButton
          variant="ink"
          className="text-[color:var(--fpl-green)]"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? t("fpl.saving") : t("fpl.confirm")}
        </FplButton>
      </div>
    </div>
  );
}
