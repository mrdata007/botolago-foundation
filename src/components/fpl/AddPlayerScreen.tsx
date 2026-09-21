import { ChevronDown, ChevronsUpDown, Info, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";
import { FplBanner, FplHeader } from "./primitives";

type SortKey = "form" | "price" | "selected";

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
 * FPL-003 "Add Player" reconstructed: full-screen list with a Back header and
 * search control, an ink "Bank" banner, three filter selects (Position /
 * Price / View), a sortable table header (Player / Form / Current Price /
 * Selected) and one row per player (info glyph, kit, name + club, metrics).
 * Rows above the affordable price are dimmed and disabled, exactly like the
 * reference.
 */
export function AddPlayerScreen({
  players,
  clubs,
  bank,
  position,
  lockPosition,
  disabledIds,
  onPick,
  onClose,
  onInfo,
}: {
  players: FantasyPlayer[];
  clubs: Club[];
  /** Remaining budget shown in the banner and used to dim unaffordable rows. */
  bank: number;
  position?: Position;
  /** Keep the position filter locked to the slot being filled. */
  lockPosition?: boolean;
  disabledIds: string[];
  onPick: (player: FantasyPlayer) => void;
  onClose: () => void;
  onInfo?: (player: FantasyPlayer) => void;
}) {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const [pos, setPos] = useState<Position | "">(position ?? "");
  const [maxPrice, setMaxPrice] = useState<number | "">("");
  const [clubId, setClubId] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("price");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const prices = useMemo(() => {
    const set = new Set(players.map((p) => Math.round(p.price * 10) / 10));
    return [...set].sort((a, b) => b - a);
  }, [players]);

  const rows = useMemo(() => {
    let list = players.slice();
    const effectivePos = lockPosition && position ? position : pos;
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
  }, [players, pos, position, lockPosition, clubId, maxPrice, query, sort]);

  const clubOf = (id: string) => clubs.find((c) => c.id === id);
  const disabled = new Set(disabledIds);

  const headerCell = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      className={cn(
        "inline-flex items-center justify-end gap-0.5 text-[12px] font-bold",
        sort === key ? "text-[color:var(--fpl-ink)]" : "text-[color:var(--fpl-grey-text)]",
      )}
      aria-pressed={sort === key}
    >
      {label}
      <ChevronsUpDown className="h-3 w-3" aria-hidden />
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-white"
      role="dialog"
      aria-modal="true"
      aria-label={t("fpl.add_player")}
    >
      <div className="mx-auto min-h-full w-full max-w-[480px] bg-white">
        <FplHeader
          title={t("fpl.add_player")}
          onBack={onClose}
          right={
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={t("fpl.search_player")}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/45 text-[color:var(--fpl-ink)]"
            >
              {searchOpen ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Search className="h-5 w-5" aria-hidden />
              )}
            </button>
          }
        >
          {searchOpen ? (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("fpl.search_player")}
              className="mt-2 h-11 w-full rounded-[6px] border-0 bg-white px-3 text-[15px] text-foreground outline-none ring-1 ring-white/60"
            />
          ) : null}
        </FplHeader>
        <FplBanner>
          {t("fpl.bank")} {nf.format(bank)}
        </FplBanner>

        {/* Filters */}
        <div className="grid grid-cols-3 gap-2 border-b border-[color:var(--fpl-grey)] px-3 py-2">
          <FilterSelect
            label={t("fpl.position")}
            value={lockPosition && position ? position : pos}
            disabled={lockPosition}
            onChange={(v) => setPos(v as Position | "")}
            options={[
              { value: "", label: t("fpl.all") },
              { value: "GK", label: t("player.pos.GK") },
              { value: "DEF", label: t("player.pos.DEF") },
              { value: "MID", label: t("player.pos.MID") },
              { value: "FWD", label: t("player.pos.FWD") },
            ]}
          />
          <FilterSelect
            label={t("fpl.price")}
            value={maxPrice === "" ? "" : String(maxPrice)}
            onChange={(v) => setMaxPrice(v === "" ? "" : Number(v))}
            options={[
              { value: "", label: t("fpl.unlimited") },
              ...prices.map((p) => ({ value: String(p), label: nf.format(p) })),
            ]}
          />
          <FilterSelect
            label={t("fpl.view")}
            value={clubId}
            onChange={setClubId}
            options={[
              { value: "", label: t("fpl.all_clubs") },
              ...clubs.map((c) => ({ value: c.id, label: tr(c.shortName) })),
            ]}
          />
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[1fr_44px_64px_64px] items-center gap-2 border-b border-[color:var(--fpl-grey)] px-3 py-2">
          <span className="text-[12px] font-bold text-[color:var(--fpl-grey-text)]">
            {t("fpl.player")}
          </span>
          {headerCell("form", t("fpl.form"))}
          {headerCell("price", t("fpl.current_price"))}
          {headerCell("selected", t("fpl.selected"))}
        </div>

        <ul>
          {rows.map((player) => {
            const club = clubOf(player.clubId);
            const kit = getKitForClub(club, player.kitPattern);
            const unaffordable = player.price > bank + 0.001;
            const taken = disabled.has(player.id);
            return (
              <li
                key={player.id}
                className={cn(
                  "border-b border-[color:var(--fpl-grey)]",
                  (unaffordable || taken) && "opacity-40",
                )}
              >
                <div className="grid grid-cols-[1fr_44px_64px_64px] items-center gap-2 px-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onInfo?.(player)}
                      aria-label={`${t("fpl.player_info")} ${tr(player.name)}`}
                      className="grid h-6 w-6 shrink-0 place-items-center text-[color:var(--fpl-grey-text)]"
                    >
                      <Info className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={unaffordable || taken}
                      onClick={() => onPick(player)}
                      className="flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 text-start disabled:cursor-not-allowed"
                    >
                      <JerseyVisual kit={kit} size={28} imageUrl={player.jerseyImageUrl} />
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-extrabold text-foreground">
                          {tr(player.name)}
                        </span>
                        <span className="block truncate text-[11px] text-[color:var(--fpl-grey-text)]">
                          {club ? tr(club.shortName) : ""}
                        </span>
                      </span>
                    </button>
                  </div>
                  <span className="fpl-tabular text-end text-[13px] text-foreground">
                    {player.form === null ? t("fantasy.stat.none") : player.form.toFixed(1)}
                  </span>
                  <span className="fpl-tabular text-end text-[13px] font-bold text-foreground">
                    {nf.format(player.price)}
                  </span>
                  <span className="fpl-tabular text-end text-[13px] text-foreground">
                    {player.ownership.toFixed(1)}%
                  </span>
                </div>
              </li>
            );
          })}
          {rows.length === 0 ? (
            <li className="px-4 py-8 text-center text-[14px] text-[color:var(--fpl-grey-text)]">
              {t("state.empty")}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] font-semibold text-[color:var(--fpl-grey-text)]">
        {label}
      </span>
      <span className="relative block">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full appearance-none truncate rounded-[4px] bg-white pe-6 text-[13px] font-bold text-foreground outline-none disabled:opacity-70"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-1 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--fpl-grey-text)]"
          aria-hidden
        />
      </span>
    </label>
  );
}
