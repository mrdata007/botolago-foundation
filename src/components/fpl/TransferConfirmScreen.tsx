import type { CSSProperties } from "react";

import { SectionHeader } from "@/components/common/SectionHeader";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiButton, UiCard, UiHeader, UiKeyValueRow } from "@/components/ui-kit";
import type { ChipKey, ChipState } from "@/lib/fantasy-engine";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer } from "@/types/fantasy";
import { findClub } from "./club-lookup";
import { formatDeadline } from "./deadline";
import { FplChipsRow } from "./FplChipsRow";

/**
 * FPL-007 transfer confirmation.
 *
 * It belongs to the same screen as the pitch it came from, so it keeps that
 * screen's chrome: the sub-page header ("FANTASY · Transferts", Back returns to
 * the pitch), the navy band stating what is about to happen and before when,
 * then Out / In, the points overview and the transfer chips.
 *
 * Nothing here is a direction: the old `ArrowLeft` / `ArrowRight` pair pointed
 * the wrong way under `dir="rtl"`, so out and in are stated in words, each on
 * a 4px edge in its own status colour — a logical inline-start bar, so it is
 * the right edge in Arabic — never by colour alone and never by an arrow.
 *
 * The chips are the same pills as above the Pick Team pitch (`FplChipsRow`):
 * a tap on an available one plays it, every other state is inert. The
 * Modify / Confirm pair sticks above the bottom navigation on a phone.
 */
export function TransferConfirmScreen({
  pairs,
  clubs,
  gameweek,
  deadlineIso,
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
  deadlineIso: string;
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

  const clubOf = (id: string) => findClub(clubs, id);

  const line = (player: FantasyPlayer, side: "out" | "in") => {
    const club = clubOf(player.clubId);
    return (
      <div className="flex min-w-0 items-stretch">
        <span
          aria-hidden
          className={cn(
            "w-1 shrink-0",
            side === "out" ? "bg-[color:var(--ui-negative)]" : "bg-[color:var(--ui-positive)]",
          )}
        />
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pe-4 ps-3">
          <span
            className={cn(
              "w-[4.75rem] shrink-0",
              ui.text.label,
              side === "out" ? ui.tone.negative : ui.tone.positive,
            )}
          >
            {side === "out" ? t("fpl.transfer_out") : t("fpl.transfer_in")}
          </span>
          <span
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center",
              ui.radius.full,
              ui.surface.sunken,
            )}
          >
            <JerseyVisual
              kit={getKitForClub(club, player.kitPattern)}
              size={24}
              variant="flat"
              imageUrl={player.jerseyImageUrl}
            />
          </span>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "truncate",
                ui.text.secondary,
                "[font-weight:var(--ui-weight-heavy)]",
                ui.tone.default,
              )}
            >
              {tr(player.name)}
            </div>
            <div className={cn("truncate", ui.text.micro, ui.tone.muted)}>
              {club ? tr(club.shortName) : ""}
            </div>
          </div>
          <span className={cn("shrink-0", ui.stat.sm, ui.tone.default)}>
            {nf.format(player.price)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <UiHeader kicker={t("fantasy.title")} title={t("fpl.transfers")} onBack={onEdit} />
      <div
        className={cn("px-[var(--ui-gutter)] py-3", ui.surface.inkPlain, ui.club.stripes)}
        style={{ "--stripe-alpha": "4%" } as CSSProperties}
      >
        <p className={cn("text-balance", ui.display.team)}>
          {pairs.length === 1
            ? t("fpl.about_to_transfer_one")
            : t("fpl.about_to_transfer").replace("{n}", String(pairs.length))}
        </p>
        <p className={cn("mt-1", ui.text.meta, ui.tone.onInkMuted)}>
          {t("fpl.gameweek")} {gameweek} · {t("fpl.deadline")}
          {/* French sets a narrow no-break space before a colon. */}
          {lang === "fr" ? " :" : ":"}{" "}
          <strong className={cn("whitespace-nowrap", ui.tone.onInkPlain)}>
            <bdi>{formatDeadline(deadlineIso, lang)}</bdi>
          </strong>
        </p>
      </div>

      <UiCard padding="none" className={cn("mt-4 overflow-hidden", "mx-[var(--ui-gutter)]")}>
        {/*
          Out and in are stacked, not columned: at 390px two columns cut a real
          Botola name in half, and the pair reads as a sentence anyway.
        */}
        <ul>
          {pairs.map((pair) => (
            <li key={pair.out.id + pair.in.id} className={ui.rule.block}>
              {line(pair.out, "out")}
              {line(pair.in, "in")}
            </li>
          ))}
        </ul>
        <p className={cn("px-4 py-3 text-center", ui.text.meta, ui.tone.muted)}>
          {t("fpl.transfers_active_note").replace("{n}", String(gameweek))}
        </p>
      </UiCard>

      <section className={cn("mt-6", ui.space.gutter)}>
        <SectionHeader title={t("fpl.points_overview")} />
        <UiCard padding="none" className="px-3">
          <UiKeyValueRow label={t("fpl.free_transfers_used")} value={freeUsed} />
          <UiKeyValueRow
            label={t("fpl.additional_transfers_used")}
            value={`${paidUsed} (${hitPoints} ${t("fantasy.points.abbr")})`}
          />
          <UiKeyValueRow
            label={t("fpl.left_in_bank")}
            value={nf.format(bankAfter)}
            className="border-b-0"
          />
        </UiCard>
        <FplChipsRow className="mt-3" chips={chips} onSelect={onChip} />
      </section>

      <div
        className={cn(
          "sticky bottom-[var(--bottomnav-h)] z-30 mt-6 grid grid-cols-2 gap-2 pb-2.5 pt-2.5 md:bottom-0 md:pb-3",
          ui.space.gutter,
          ui.surface.bar,
          ui.rule.blockStart,
          ui.shadow.raised,
        )}
      >
        <UiButton variant="soft" onClick={onEdit} disabled={busy}>
          {t("fpl.edit_transfers")}
        </UiButton>
        <UiButton variant="ink" onClick={onConfirm} disabled={busy}>
          {busy ? t("fpl.saving") : t("fpl.confirm")}
        </UiButton>
      </div>
    </div>
  );
}
