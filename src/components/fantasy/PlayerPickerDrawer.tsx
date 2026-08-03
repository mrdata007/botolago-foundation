import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/provider";
import type { FantasyPlayer, Position } from "@/types/fantasy";
import type { Club } from "@/types/domain";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClubCrest } from "@/components/common/ClubCrest";
import { PlayerStatusBadge } from "./PlayerStatusBadge";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

type SortKey = "price" | "form" | "points" | "ownership";

export function PlayerPickerDrawer({
  open,
  onClose,
  onPick,
  players,
  clubs,
  position,
  disabledIds = [],
  maxPrice,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (p: FantasyPlayer) => void;
  players: FantasyPlayer[];
  clubs: Club[];
  position?: Position;
  disabledIds?: string[];
  maxPrice?: number;
  title?: string;
}) {
  const { t, tr, lang, dir } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const [q, setQ] = useState("");
  const [clubId, setClubId] = useState<string>("");
  const [pos, setPos] = useState<Position | "">(position ?? "");
  const [sort, setSort] = useState<SortKey>("points");

  const filtered = useMemo(() => {
    let list = players.slice();
    if (position) list = list.filter((p) => p.position === position);
    else if (pos) list = list.filter((p) => p.position === pos);
    if (clubId) list = list.filter((p) => p.clubId === clubId);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((p) => p.name.fr.toLowerCase().includes(s) || p.name.ar.includes(q));
    }
    if (typeof maxPrice === "number") list = list.filter((p) => p.price <= maxPrice + 0.001);
    list.sort((a, b) => {
      if (sort === "price") return b.price - a.price;
      if (sort === "form") return b.form - a.form;
      if (sort === "ownership") return b.ownership - a.ownership;
      return b.totalPoints - a.totalPoints;
    });
    return list;
  }, [players, position, pos, clubId, q, maxPrice, sort]);

  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  const sorts: { k: SortKey; labelKey: TranslationKey }[] = [
    { k: "points", labelKey: "fantasy.picker.sort.points" },
    { k: "form", labelKey: "fantasy.picker.sort.form" },
    { k: "price", labelKey: "fantasy.picker.sort.price" },
    { k: "ownership", labelKey: "fantasy.picker.sort.ownership" },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side={dir === "rtl" ? "left" : "right"} className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title ?? t("fantasy.picker.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("fantasy.picker.search")}</SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-2">
          <label className="glass-surface glass-regular flex items-center gap-2 rounded-xl border border-[var(--glass-border)] px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("fantasy.picker.search")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>

          {!position && (
            <div className="flex flex-wrap gap-1">
              <FilterChip active={pos === ""} onClick={() => setPos("")}>
                {t("common.all")}
              </FilterChip>
              {positions.map((p) => (
                <FilterChip key={p} active={pos === p} onClick={() => setPos(p)}>
                  {t(`player.pos.${p}` as TranslationKey)}
                </FilterChip>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            <FilterChip active={clubId === ""} onClick={() => setClubId("")}>
              {t("common.all")}
            </FilterChip>
            {clubs.map((c) => (
              <FilterChip key={c.id} active={clubId === c.id} onClick={() => setClubId(c.id)}>
                <ClubCrest club={c} size="sm" className="h-5 w-5 rounded-full text-[8px]" />
                {tr(c.shortName)}
              </FilterChip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1 pt-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              {t("fantasy.picker.sort")}:
            </span>
            {sorts.map((s) => (
              <FilterChip key={s.k} active={sort === s.k} onClick={() => setSort(s.k)}>
                {t(s.labelKey)}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="mt-3 max-h-[60vh] overflow-y-auto pe-1">
          {filtered.length === 0 && (
            <div className="rounded-xl bg-muted/50 p-6 text-center text-sm text-muted-foreground">
              {t("state.empty")}
            </div>
          )}
          <ul className="grid gap-1.5">
            {filtered.map((p) => {
              const club = clubs.find((c) => c.id === p.clubId);
              const disabled = disabledIds.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(p)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl bg-white/60 px-3 py-2 text-start ring-1 ring-black/5 transition-colors",
                      !disabled && "hover:bg-white/90",
                      disabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {club && <ClubCrest club={club} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="truncate text-sm font-bold text-foreground">
                          {tr(p.name)}
                        </div>
                        {p.status !== "available" && <PlayerStatusBadge status={p.status} />}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {t(`player.pos.${p.position}` as TranslationKey)} · {t("fantasy.form")}{" "}
                        {nf.format(p.form)} · {nf.format(p.ownership)}%
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-sm font-black tabular-nums">{nf.format(p.price)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {p.totalPoints} pts
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "bg-[color:var(--brand-primary)] text-white"
          : "bg-white/60 text-foreground ring-1 ring-black/5 hover:bg-white",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
