import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiBanner, UiButton, UiCard, UiHeader, UiKeyValueRow } from "@/components/ui-kit";
import type { ChipKey, ChipState } from "@/lib/fantasy-engine";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer } from "@/types/fantasy";

/**
 * FPL-007 transfer confirmation.
 *
 * It belongs to the same screen as the pitch it came from, so it keeps that
 * screen's chrome: the gradient header, the gameweek + deadline line, the ink
 * banner, then Out / In, the points overview and the chips. Nothing here is a
 * direction: the old `ArrowLeft` / `ArrowRight` pair pointed the wrong way
 * under `dir="rtl"`, so out and in are stated as toned badges instead.
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
  const deadline = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    // BG-0100: the competition's calendar, never the viewer's browser.
    timeZone: MATCH_TIME_ZONE,
  }).format(new Date(deadlineIso));

  const clubOf = (id: string) => clubs.find((c) => c.id === id);
  const chipLabel = (key: ChipKey) =>
    key === "wildcard"
      ? t("fantasy.chip.wildcard")
      : key === "free_hit"
        ? t("fantasy.chip.free_hit")
        : key === "bench_boost"
          ? t("fantasy.chip.bench_boost")
          : t("fantasy.chip.triple_captain");
  const chipStateLabel = (state: ChipState) =>
    state === "active"
      ? t("fpl.state.active")
      : state === "available"
        ? t("fpl.state.play")
        : state === "used"
          ? t("fpl.state.used")
          : t("fpl.state.unavailable");

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
          <div
            className={cn(
              "truncate",
              ui.text.meta,
              "[font-weight:var(--ui-weight-heavy)]",
              ui.tone.default,
            )}
          >
            {tr(player.name)}
          </div>
          <div className={cn("truncate", ui.text.micro, ui.tone.muted)}>
            {club ? tr(club.shortName) : ""} ·{" "}
            <span className={ui.text.tabular}>{nf.format(player.price)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <UiHeader title={t("fpl.transfers")} tone="gradient" onBack={onEdit}>
        <p className={cn("mt-1 text-center", ui.text.secondary)}>
          {t("fpl.gameweek")} {gameweek} · {t("fpl.deadline")}
          {/* French sets a narrow no-break space before a colon. */}
          {lang === "fr" ? "\u202F:" : ":"}{" "}
          <strong className="whitespace-nowrap [font-weight:var(--ui-weight-heavy)]">
            {deadline}
          </strong>
        </p>
      </UiHeader>
      <UiBanner>
        {pairs.length === 1
          ? t("fpl.about_to_transfer_one")
          : t("fpl.about_to_transfer").replace("{n}", String(pairs.length))}
      </UiBanner>

      <UiCard padding="sm" className="mx-3 mt-3">
        {/*
          Out and in are stacked, not columned: at 390px two columns cut a real
          Botola name in half, and the pair reads as a sentence anyway. The side
          each line belongs to is carried by a coloured inline-start rule plus a
          worded caption — never by an arrow, which points the wrong way in
          Arabic, and never by colour alone.
        */}
        <ul>
          {pairs.map((pair) => (
            <li key={pair.out.id + pair.in.id} className={cn("py-2", ui.rule.block)}>
              <div className="flex min-w-0 items-center gap-2 border-s-2 border-[color:var(--ui-negative)] ps-2">
                <span className={cn("min-w-[4.5rem] shrink-0", ui.text.label, ui.tone.negative)}>
                  {t("fpl.transfer_out")}
                </span>
                {tile(pair.out)}
              </div>
              <div className="mt-2 flex min-w-0 items-center gap-2 border-s-2 border-[color:var(--ui-positive)] ps-2">
                <span className={cn("min-w-[4.5rem] shrink-0", ui.text.label, ui.tone.positive)}>
                  {t("fpl.transfer_in")}
                </span>
                {tile(pair.in)}
              </div>
            </li>
          ))}
        </ul>
        <p className={cn("pt-3 text-center", ui.text.meta, ui.tone.muted)}>
          {t("fpl.transfers_active_note").replace("{n}", String(gameweek))}
        </p>
      </UiCard>

      <UiCard padding="sm" className="mx-3 mt-3 pt-4">
        <h2 className={cn(ui.text.section, ui.tone.default)}>{t("fpl.points_overview")}</h2>
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
        <div className="mt-3 grid grid-cols-2 gap-2">
          {chips.map((chip) => {
            const enabled = chip.state === "available" && !!onChip;
            return (
              <UiButton
                key={chip.key}
                variant={chip.state === "active" ? "gradient" : enabled ? "ink" : "light"}
                disabled={!enabled}
                onClick={() => onChip?.(chip.key)}
                className="flex-col gap-0 py-1"
              >
                <span className="truncate">{chipLabel(chip.key)}</span>
                <span className={cn("truncate", ui.text.micro)}>{chipStateLabel(chip.state)}</span>
              </UiButton>
            );
          })}
        </div>
      </UiCard>

      <div
        className={cn(
          "sticky bottom-0 z-30 mt-4 grid grid-cols-2 gap-2 px-3 pt-2",
          ui.surface.bar,
          ui.rule.blockStart,
          ui.safe.bottom,
        )}
      >
        <UiButton variant="light" onClick={onEdit} disabled={busy}>
          {t("fpl.edit_transfers")}
        </UiButton>
        <UiButton variant="ink" onClick={onConfirm} disabled={busy}>
          {busy ? t("fpl.saving") : t("fpl.confirm")}
        </UiButton>
      </div>
    </div>
  );
}
