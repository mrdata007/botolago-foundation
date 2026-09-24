import { Check, Lock, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { crestStyle } from "@/components/common/club-crest-style";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import {
  ui,
  UiBadge,
  UiButton,
  UiChip,
  UiEmptyState,
  UiIconButton,
  UiInput,
  UiPill,
  UiSelect,
  UiSheet,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club, Player } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";
import { findClub } from "./club-lookup";

type SortKey = "form" | "price" | "selected" | "points";

/**
 * Why a row cannot be picked. The screen never decides any of these: the
 * squad rules live in the routes, which own the draft/squad, and hand the
 * answers down. The screen's job is to show the answer BEFORE the tap, so a
 * manager stops learning the rules from toasts.
 */
export type PickBlock = "taken" | "no_slot" | "club_limit" | "budget";

const ALL_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

/**
 * Three filters abreast at 390px: the kit field's 15px body size and 12px
 * gutters leave a club name no room, so the filter row steps down one notch
 * on the type ramp and tightens its gutters. Both are ramp steps, not new
 * numbers. Round, like every control in Option A.
 */
const FILTER_FIELD = "rounded-full px-3 pe-8 text-[length:var(--ui-text-meta)]";

/**
 * BG-0071 — descending form, with "no value yet" (`null`) sorted below every
 * real number, including a real 0.0. Written as explicit branches rather than a
 * sentinel subtraction because today EVERY player's form is null (no gameweek
 * has scored), and `-Infinity - -Infinity` is NaN — a comparator that returns
 * NaN for every pair leaves the list in an unspecified order.
 */
const compareForm = (a: number | null, b: number | null) =>
  a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : b - a;

/**
 * The player picker.
 *
 * One row must answer six questions at 390px without a tap: who, which club,
 * which position, what price, is he available, and can I actually add him.
 * The last one is the reason this screen exists in this shape — a manager used
 * to tap a third Wydad player, get a toast, and be left staring at the same
 * open list with no idea which of the other rows would do the same. Every
 * rule that can refuse a pick is now resolved up front by the route and
 * rendered on the row as a disabled state with its reason.
 *
 * The position control is the other half of that: it is the single source of
 * truth for what the list contains. When a slot imposes a position, the
 * control carries THAT position, cannot be changed, and offers no other — it
 * can no longer say "Tous" over a list of goalkeepers.
 *
 * Option A (A-Players): a white sheet header — title, the bank on a navy
 * pill, a round close — then a round search field, the positions as a row of
 * pill chips, the club / price / sort filters, and "N joueurs sur M". Each row
 * is ONE button (the e2e picker reads `li button`, and a control nested in a
 * control is invalid HTML): the club's edge bar, the club's shirt in a soft
 * disc, name, "ATT · Club", "Forme · Sélection", the price over the season's
 * points, and a decorative 44px disc saying what a tap does — "+" to add, a
 * navy check for a player already in the squad (or already in this slot), a
 * lock for any other refusal.
 */
export function AddPlayerScreen({
  players,
  clubs,
  bank,
  position,
  lockPosition,
  allowedPositions,
  clubLimitReached,
  disabledIds,
  currentPlayerId,
  onPick,
  onRemove,
  onClose,
}: {
  players: FantasyPlayer[];
  clubs: Club[];
  /** Remaining budget shown in the header and used to block unaffordable rows. */
  bank: number;
  position?: Position;
  /** Keep the position filter pinned to the slot being filled. */
  lockPosition?: boolean;
  /**
   * Positions that still have somewhere to go. Omitted means "all four".
   * When exactly one is left the picker pins itself to it, so the control and
   * the list can never disagree.
   */
  allowedPositions?: Position[];
  /** "Adding this player would break the three-per-club rule." Owned by the route. */
  clubLimitReached?: (player: FantasyPlayer) => boolean;
  disabledIds: string[];
  /** The player currently occupying the slot being filled, if any. */
  currentPlayerId?: string | null;
  onPick: (player: FantasyPlayer) => void;
  /** Clear the slot instead of replacing its player. */
  onRemove?: () => void;
  onClose: () => void;
}) {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const whole = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");

  const [pos, setPos] = useState<Position | "">("");
  const [maxPrice, setMaxPrice] = useState<number | "">("");
  const [clubId, setClubId] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("price");
  const [query, setQuery] = useState("");

  // Literal branches, never a computed key: a key assembled at runtime is
  // invisible to the i18n gate (W4) and to the TranslationKey type alike.
  const positionLabel = (value: Position) =>
    value === "GK"
      ? t("player.pos.GK")
      : value === "DEF"
        ? t("player.pos.DEF")
        : value === "MID"
          ? t("player.pos.MID")
          : t("player.pos.FWD");
  const statusLabel = (value: Player["status"]) =>
    value === "injured"
      ? t("player.status.injured")
      : value === "doubtful"
        ? t("player.status.doubtful")
        : value === "suspended"
          ? t("player.status.suspended")
          : t("player.status.available");
  const blockLabel = (block: PickBlock) =>
    block === "taken"
      ? t("fpl.pick.blocked.taken")
      : block === "no_slot"
        ? t("fpl.pick.blocked.no_slot")
        : block === "club_limit"
          ? t("fpl.pick.blocked.club_limit")
          : t("fpl.pick.blocked.budget");

  const openPositions = useMemo(
    () => (allowedPositions ? ALL_POSITIONS.filter((p) => allowedPositions.includes(p)) : null),
    [allowedPositions],
  );
  const selectable = openPositions ?? ALL_POSITIONS;
  /**
   * The position the screen is pinned to, if any: either the slot imposes it,
   * or only one position still has a free slot. `null` means the manager
   * chooses, and `pos` is then clamped to what is actually offered so the
   * control can never carry a value the list does not honour.
   */
  const pinned: Position | null =
    lockPosition && position ? position : selectable.length === 1 ? selectable[0]! : null;
  const effectivePos: Position | "" = pinned ?? (selectable.includes(pos as Position) ? pos : "");

  const prices = useMemo(() => {
    const set = new Set(players.map((p) => Math.round(p.price * 10) / 10));
    return [...set].sort((a, b) => b - a);
  }, [players]);

  const taken = useMemo(() => new Set(disabledIds), [disabledIds]);
  const blockOf = (player: FantasyPlayer): PickBlock | null => {
    if (taken.has(player.id)) return "taken";
    if (openPositions && !openPositions.includes(player.position)) return "no_slot";
    if (clubLimitReached?.(player)) return "club_limit";
    if (player.price > bank + 0.001) return "budget";
    return null;
  };

  const rows = useMemo(() => {
    let list = players.slice();
    if (effectivePos) list = list.filter((p) => p.position === effectivePos);
    if (clubId) list = list.filter((p) => p.clubId === clubId);
    if (maxPrice !== "") list = list.filter((p) => p.price <= maxPrice + 0.001);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.fr.toLowerCase().includes(q) || p.name.ar.includes(query.trim()),
      );
    }
    list.sort((a, b) => {
      if (sort === "form") return compareForm(a.form, b.form) || b.price - a.price;
      if (sort === "selected") return b.ownership - a.ownership || b.price - a.price;
      if (sort === "points") return b.totalPoints - a.totalPoints || b.price - a.price;
      return b.price - a.price || a.name.fr.localeCompare(b.name.fr);
    });
    return list;
  }, [players, effectivePos, clubId, maxPrice, query, sort]);

  const current = currentPlayerId ? players.find((p) => p.id === currentPlayerId) : undefined;

  const header = (
    <div className={cn("shrink-0 pb-1", ui.surface.bar, ui.rule.block)}>
      <div className="flex items-center gap-2 pe-3 ps-4 pt-3">
        {/* The dialog's name is the sheet's own (visually hidden) title; this
            is the same words for the eye, so it is hidden from the tree. */}
        <p aria-hidden className={cn("min-w-0 flex-1 truncate", ui.display.header)}>
          {t("fpl.add_player")}
        </p>
        <UiPill className="shrink-0">
          {t("fpl.bank")} <span className={ui.text.tabular}>{nf.format(bank)}</span>
        </UiPill>
        <UiIconButton aria-label={t("fpl.close")} onClick={onClose}>
          <X aria-hidden />
        </UiIconButton>
      </div>

      <div className="px-4 pt-3">
        <UiInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("fpl.search_player")}
          placeholder={t("fpl.search_player")}
          leading={<Search className={cn("h-[18px] w-[18px]", ui.tone.muted)} aria-hidden />}
          trailing={
            query ? (
              <UiIconButton
                variant="ghost"
                aria-label={t("fpl.cancel")}
                onClick={() => setQuery("")}
              >
                <X aria-hidden />
              </UiIconButton>
            ) : undefined
          }
          fieldClassName={cn("min-h-[var(--ui-row-min)] ps-11", ui.radius.full, ui.rule.strong)}
        />
      </div>

      <div className="px-4 pt-2.5">
        {pinned ? (
          /**
           * An imposed position is not a control, so it is not drawn as one.
           * A disabled chip row still reads as a filter the list is ignoring;
           * a pill with a lock states the fact.
           */
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={cn(
                "inline-flex min-h-[var(--ui-tap-min)] items-center gap-1.5 px-4",
                ui.radius.full,
                ui.surface.inkPlain,
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
              )}
            >
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="sr-only">{t("fantasy.picker.filter_position")}: </span>
              {positionLabel(pinned)}
            </span>
            <span className={cn("min-w-0", ui.text.meta, ui.tone.muted)}>
              {t("fpl.pick.position_locked")}
            </span>
          </div>
        ) : (
          <div
            role="group"
            aria-label={t("fantasy.picker.filter_position")}
            className="grid grid-cols-5 gap-2"
          >
            {(["", ...ALL_POSITIONS] as const).map((value) => (
              <UiChip
                key={value || "all"}
                selected={effectivePos === value}
                disabled={value !== "" && !selectable.includes(value)}
                onClick={() => setPos(value)}
                className="justify-center px-1 disabled:opacity-45"
              >
                <span className="truncate">
                  {value === "" ? t("fpl.all") : positionLabel(value)}
                </span>
              </UiChip>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pt-2">
        <UiSelect
          label={t("fantasy.picker.filter_club")}
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
          fieldClassName={FILTER_FIELD}
          options={[
            { value: "", label: t("fpl.all") },
            ...clubs.map((c) => ({ value: c.id, label: tr(c.shortName) })),
          ]}
        />
        <UiSelect
          label={t("fantasy.picker.filter_price")}
          value={maxPrice === "" ? "" : String(maxPrice)}
          onChange={(e) => setMaxPrice(e.target.value === "" ? "" : Number(e.target.value))}
          fieldClassName={FILTER_FIELD}
          options={[
            { value: "", label: t("fpl.unlimited") },
            ...prices.map((p) => ({ value: String(p), label: nf.format(p) })),
          ]}
        />
        <UiSelect
          label={t("fantasy.picker.sort")}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          fieldClassName={FILTER_FIELD}
          options={[
            { value: "price", label: t("fantasy.picker.sort.price") },
            { value: "points", label: t("fantasy.picker.sort.points") },
            { value: "form", label: t("fantasy.picker.sort.form") },
            { value: "selected", label: t("fantasy.picker.sort.ownership") },
          ]}
        />
      </div>

      <p
        className={cn(
          "px-4 pt-2",
          ui.text.meta,
          "[font-weight:var(--ui-weight-strong)]",
          ui.tone.muted,
        )}
      >
        {t("fantasy.players.showing")
          .replace("{n}", whole.format(rows.length))
          .replace("{total}", whole.format(players.length))}
      </p>
    </div>
  );

  return (
    <UiSheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("fpl.add_player")}
      description={t("fantasy.picker.search")}
      header={header}
      className="h-[94dvh] max-h-[94dvh]"
      footer={
        onRemove ? (
          <UiButton variant="outline" onClick={onRemove}>
            {current ? `${t("fpl.remove")} · ${tr(current.name)}` : t("fpl.remove")}
          </UiButton>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <div className="p-4">
          <UiEmptyState title={t("state.empty")} body={t("fpl.pick.no_match")} />
        </div>
      ) : (
        <ul>
          {rows.map((player) => {
            const club = findClub(clubs, player.clubId);
            const kit = getKitForClub(club, player.kitPattern);
            const block = blockOf(player);
            const isCurrent = player.id === currentPlayerId;
            const owned = isCurrent || block === "taken";
            const edge = club ? crestStyle(club) : null;
            // BG-0071: a dash, not 0.0, while no gameweek has scored.
            const form = player.form === null ? t("fantasy.stat.none") : nf.format(player.form);
            const meta = [positionLabel(player.position), club ? tr(club.shortName) : null]
              .filter(Boolean)
              .join(" · ");

            return (
              <li
                key={player.id}
                data-club={edge?.["data-club"]}
                style={edge?.style}
                className={ui.rule.block}
              >
                <button
                  type="button"
                  disabled={!!block}
                  onClick={() => onPick(player)}
                  aria-pressed={isCurrent}
                  className={cn(
                    "flex w-full items-stretch text-start",
                    ui.focus,
                    "disabled:cursor-not-allowed",
                    isCurrent &&
                      "bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_10%,var(--ui-surface))]",
                  )}
                >
                  {/* The club's 4px edge, flush with the sheet's inline-start
                      edge — its own flex child, because the row also carries
                      the hairline and `ui.rule.block` colours every side. */}
                  <span aria-hidden className={cn("w-1 shrink-0", ui.club.edgeFill)} />
                  {/* Three lines of text set the row's height (~70px, the
                      board's); the row floor is the kit's, not a literal. */}
                  <span
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-3 py-2 pe-3 ps-3",
                      ui.space.row,
                    )}
                  >
                    {/*
                      A blocked row is dimmed on its artwork only. The reason
                      it is blocked is the one thing the manager has to be able
                      to read, so the text keeps a foreground that clears AA —
                      a 45%-opacity row measured 3.1:1 and taught nothing.
                    */}
                    <span
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center",
                        ui.radius.full,
                        ui.surface.sunken,
                        block && !owned && "opacity-60",
                      )}
                    >
                      <JerseyVisual
                        kit={kit}
                        size={28}
                        variant="flat"
                        imageUrl={player.jerseyImageUrl}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "min-w-0 truncate",
                            ui.text.body,
                            "[font-weight:var(--ui-weight-heavy)]",
                            block && !owned ? ui.tone.muted : ui.tone.default,
                          )}
                        >
                          {tr(player.name)}
                        </span>
                        {player.status === "available" ? null : (
                          <UiBadge
                            tone={player.status === "doubtful" ? "caution" : "negative"}
                            className="shrink-0 px-2 py-0"
                          >
                            {statusLabel(player.status)}
                          </UiBadge>
                        )}
                      </span>
                      <span
                        className={cn(
                          "block truncate",
                          ui.text.meta,
                          "[font-weight:var(--ui-weight-strong)]",
                          ui.tone.muted,
                        )}
                      >
                        {meta}
                      </span>
                      {block ? (
                        <span
                          className={cn(
                            "block truncate",
                            ui.text.meta,
                            "[font-weight:var(--ui-weight-heavy)]",
                            block === "taken" ? ui.tone.muted : ui.tone.negative,
                          )}
                        >
                          {blockLabel(block)}
                        </span>
                      ) : (
                        <span className={cn("block truncate", ui.text.meta, ui.tone.muted)}>
                          {t("fpl.form")} {form} · {t("fantasy.picker.sort.ownership")}{" "}
                          {nf.format(player.ownership)}&nbsp;%
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span
                        className={cn(
                          ui.stat.md,
                          block && !owned ? ui.tone.muted : ui.tone.default,
                        )}
                      >
                        {nf.format(player.price)}
                      </span>
                      <span className={cn(ui.text.micro, ui.tone.muted)}>
                        <span className={ui.text.tabular}>{whole.format(player.totalPoints)}</span>{" "}
                        {t("fantasy.points.abbr")}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center",
                        ui.radius.full,
                        owned
                          ? ui.surface.inkPlain
                          : block
                            ? cn(ui.surface.sunken, ui.tone.faint)
                            : cn(ui.surface.sunken, ui.tone.ink),
                      )}
                    >
                      {owned ? (
                        <Check className="h-[18px] w-[18px]" />
                      ) : block ? (
                        <Lock className="h-4 w-4" />
                      ) : (
                        <Plus className="h-[18px] w-[18px]" />
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </UiSheet>
  );
}
