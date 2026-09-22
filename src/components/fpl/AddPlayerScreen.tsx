import { Check, Lock, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import {
  ui,
  UiBadge,
  UiBanner,
  UiButton,
  UiEmptyState,
  UiHeader,
  UiInput,
  UiSegmented,
  UiSelect,
  UiSheet,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club, Player } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";

type SortKey = "form" | "price" | "selected";

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
 * numbers.
 */
const FILTER_FIELD = "px-2 pe-7 text-[length:var(--ui-text-meta)]";

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
 * truth for what the list contains. When a slot imposes a position, the select
 * carries THAT position, is disabled, and offers no other option — it can no
 * longer say "Tous" over a list of goalkeepers.
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
  /** Remaining budget shown in the banner and used to block unaffordable rows. */
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
      return b.price - a.price || a.name.fr.localeCompare(b.name.fr);
    });
    return list;
  }, [players, effectivePos, clubId, maxPrice, query, sort]);

  const clubOf = (id: string) => clubs.find((c) => c.id === id);
  const current = currentPlayerId ? players.find((p) => p.id === currentPlayerId) : undefined;

  const header = (
    <div className={cn("shrink-0", ui.surface.bar)}>
      <UiHeader
        title={t("fpl.add_player")}
        tone="gradient"
        leading={
          <button
            type="button"
            onClick={onClose}
            aria-label={t("fpl.close")}
            className={cn(
              "grid place-items-center",
              ui.space.tap,
              ui.radius.full,
              ui.focus,
              "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_35%,transparent)]",
            )}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        }
      >
        <div className="mt-2 flex items-end gap-2">
          <UiInput
            className="min-w-0 flex-1"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("fpl.search_player")}
            placeholder={t("fpl.search_player")}
          />
          {query ? (
            <UiButton variant="light" size="sm" onClick={() => setQuery("")}>
              <X className="h-4 w-4" aria-hidden />
              <span className="sr-only">{t("fpl.cancel")}</span>
            </UiButton>
          ) : null}
        </div>
      </UiHeader>

      <UiBanner>
        {t("fpl.bank")} <span className={ui.text.tabular}>{nf.format(bank)}</span>
      </UiBanner>

      <div className={cn("px-3 py-2", ui.surface.bar, ui.rule.block)}>
        <div className="grid grid-cols-3 gap-2">
          {pinned ? (
            /**
             * An imposed position is not a control, so it is not drawn as one.
             * A disabled select still opens, still lists "Tous", and still
             * reads as a filter the list is ignoring; a pill states the fact.
             */
            <div className="flex flex-col gap-1">
              <span className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}>
                {t("fantasy.picker.filter_position")}
              </span>
              <span
                className={cn(
                  "inline-flex min-h-[var(--ui-tap-min)] items-center gap-1 px-2",
                  ui.radius.track,
                  ui.surface.sunken,
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                )}
              >
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{positionLabel(pinned)}</span>
              </span>
            </div>
          ) : (
            <UiSelect
              label={t("fantasy.picker.filter_position")}
              value={effectivePos}
              onChange={(e) => setPos(e.target.value as Position | "")}
              fieldClassName={FILTER_FIELD}
              options={[
                { value: "", label: t("fpl.all") },
                ...selectable.map((p) => ({ value: p, label: positionLabel(p) })),
              ]}
            />
          )}
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
            label={t("fantasy.picker.filter_club")}
            value={clubId}
            onChange={(e) => setClubId(e.target.value)}
            fieldClassName={FILTER_FIELD}
            options={[
              { value: "", label: t("fpl.all") },
              ...clubs.map((c) => ({ value: c.id, label: tr(c.shortName) })),
            ]}
          />
        </div>
        {pinned ? (
          <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>{t("fpl.pick.position_locked")}</p>
        ) : null}
        <UiSegmented
          className="mt-2"
          label={t("fantasy.picker.sort")}
          value={sort}
          onChange={setSort}
          options={[
            { value: "price", label: t("fantasy.picker.sort.price") },
            { value: "form", label: t("fantasy.picker.sort.form") },
            { value: "selected", label: t("fantasy.picker.sort.ownership") },
          ]}
        />
      </div>
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
            const club = clubOf(player.clubId);
            const kit = getKitForClub(club, player.kitPattern);
            const block = blockOf(player);
            const isCurrent = player.id === currentPlayerId;
            // BG-0071: a dash, not 0.0, while no gameweek has scored.
            const form = player.form === null ? t("fantasy.stat.none") : player.form.toFixed(1);
            const extra =
              sort === "form"
                ? `${t("fantasy.picker.sort.form")} ${form}`
                : sort === "selected"
                  ? `${nf.format(player.ownership)}%`
                  : null;
            const meta = [club ? tr(club.shortName) : null, positionLabel(player.position), extra]
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={player.id} className={ui.rule.block}>
                <button
                  type="button"
                  disabled={!!block}
                  onClick={() => onPick(player)}
                  aria-pressed={isCurrent}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-start",
                    ui.space.row,
                    ui.focus,
                    "disabled:cursor-not-allowed",
                    isCurrent &&
                      "bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_12%,var(--ui-surface))]",
                  )}
                >
                  {/*
                    A blocked row is dimmed on its artwork only. The reason it
                    is blocked is the one thing the manager has to be able to
                    read, so the text keeps a foreground that clears AA — a
                    45%-opacity row measured 3.1:1 and taught nothing.
                  */}
                  <span className={cn("shrink-0", block && "opacity-60")}>
                    <JerseyVisual kit={kit} size={28} imageUrl={player.jerseyImageUrl} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          ui.text.body,
                          "[font-weight:var(--ui-weight-heavy)]",
                          block ? ui.tone.muted : ui.tone.default,
                        )}
                      >
                        {tr(player.name)}
                      </span>
                      {player.status === "available" ? null : (
                        <UiBadge
                          tone={player.status === "doubtful" ? "neutral" : "negative"}
                          className="shrink-0 px-2 py-0"
                        >
                          {statusLabel(player.status)}
                        </UiBadge>
                      )}
                    </span>
                    <span className={cn("block truncate", ui.text.meta, ui.tone.muted)}>
                      {meta}
                      {block ? (
                        <>
                          {meta ? " · " : null}
                          <span
                            className={cn(
                              block === "taken" ? ui.tone.muted : ui.tone.negative,
                              "[font-weight:var(--ui-weight-heavy)]",
                            )}
                          >
                            {blockLabel(block)}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-end",
                      ui.stat.sm,
                      block ? ui.tone.muted : ui.tone.default,
                    )}
                  >
                    {nf.format(player.price)}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center",
                      ui.radius.full,
                      block
                        ? cn(ui.surface.sunken, ui.tone.faint)
                        : isCurrent
                          ? cn(ui.surface.ink, ui.tone.onInk)
                          : cn(ui.surface.sunken, ui.tone.ink),
                    )}
                  >
                    {block ? (
                      <Lock className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
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
