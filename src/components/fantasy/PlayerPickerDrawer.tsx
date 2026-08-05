import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { PlayerDecisionSummary } from "@/components/fantasy/PlayerDecisionSummary";
import { selectUpcomingFixture } from "@/components/fantasy/player-decision-presentation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import type { Player } from "@/types/domain";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";

type SortKey = "fixture" | "price" | "name" | "availability";
const statusOrder: Record<Player["status"], number> = {
  available: 0,
  doubtful: 1,
  injured: 2,
  suspended: 3,
};

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
  onPick: (player: FantasyPlayer) => void;
  players: FantasyPlayer[];
  clubs: Club[];
  position?: Position;
  disabledIds?: string[];
  maxPrice?: number;
  title?: string;
}) {
  const { t, tr, lang, dir } = useI18n();
  const fixturesQ = useQuery({
    queryKey: ["fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
    enabled: open,
  });
  const fixtures = fixturesQ.data ?? [];
  const [q, setQ] = useState("");
  const [clubId, setClubId] = useState("");
  const [pos, setPos] = useState<Position | "">(position ?? "");
  const [sort, setSort] = useState<SortKey>("fixture");

  const filtered = useMemo(() => {
    let list = players.slice();
    if (position) list = list.filter((player) => player.position === position);
    else if (pos) list = list.filter((player) => player.position === pos);
    if (clubId) list = list.filter((player) => player.clubId === clubId);
    if (q.trim()) {
      const normalized = q.toLowerCase();
      list = list.filter(
        (player) =>
          player.name.fr.toLowerCase().includes(normalized) ||
          player.name.ar.includes(q),
      );
    }
    if (typeof maxPrice === "number") {
      list = list.filter((player) => player.price <= maxPrice + 0.001);
    }

    const nextFixtureByClub = new Map(
      Array.from(new Set(list.map((player) => player.clubId))).map((id) => [
        id,
        selectUpcomingFixture(id, fixtures),
      ]),
    );

    list.sort((left, right) => {
      if (sort === "price") return right.price - left.price;
      if (sort === "name")
        return left.name[lang].localeCompare(right.name[lang], lang);
      if (sort === "availability") {
        return (
          statusOrder[left.status] - statusOrder[right.status] ||
          right.price - left.price
        );
      }

      const leftFixture = nextFixtureByClub.get(left.clubId);
      const rightFixture = nextFixtureByClub.get(right.clubId);
      if (!leftFixture && !rightFixture) return right.price - left.price;
      if (!leftFixture) return 1;
      if (!rightFixture) return -1;
      return (
        leftFixture.gameweek - rightFixture.gameweek ||
        leftFixture.difficulty - rightFixture.difficulty ||
        right.price - left.price
      );
    });
    return list;
  }, [players, position, pos, clubId, q, maxPrice, sort, lang, fixtures]);

  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  const sorts: { key: SortKey; labelKey: TranslationKey }[] = [
    { key: "fixture", labelKey: "fantasy.picker.sort.fixture" },
    { key: "price", labelKey: "fantasy.picker.sort.price" },
    { key: "availability", labelKey: "fantasy.picker.sort.availability" },
    { key: "name", labelKey: "fantasy.picker.sort.name" },
  ];

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent
        side={dir === "rtl" ? "left" : "right"}
        className="w-full sm:max-w-md"
      >
        <SheetHeader className="text-start">
          <SheetTitle>{title ?? t("fantasy.picker.title")}</SheetTitle>
          <SheetDescription>
            {t("fantasy.players.decision_intro")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-2">
          <label className="glass-surface glass-regular flex min-h-11 items-center gap-2 rounded-xl border border-[var(--glass-border)] px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={t("fantasy.picker.search")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>

          {!position && (
            <div className="flex flex-wrap gap-1">
              <FilterChip active={pos === ""} onClick={() => setPos("")}>
                {t("common.all")}
              </FilterChip>
              {positions.map((item) => (
                <FilterChip
                  key={item}
                  active={pos === item}
                  onClick={() => setPos(item)}
                >
                  {t(`player.pos.${item}` as TranslationKey)}
                </FilterChip>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            <FilterChip active={clubId === ""} onClick={() => setClubId("")}>
              {t("common.all")}
            </FilterChip>
            {clubs.map((club) => (
              <FilterChip
                key={club.id}
                active={clubId === club.id}
                onClick={() => setClubId(club.id)}
              >
                <ClubCrest
                  club={club}
                  size="sm"
                  className="h-5 w-5 rounded-full text-[8px]"
                />
                {tr(club.shortName)}
              </FilterChip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1 pt-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              {t("fantasy.picker.sort")}:
            </span>
            {sorts.map((item) => (
              <FilterChip
                key={item.key}
                active={sort === item.key}
                onClick={() => setSort(item.key)}
              >
                {t(item.labelKey)}
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
          <ul className="grid gap-2">
            {filtered.map((player) => {
              const club = clubs.find(
                (candidate) => candidate.id === player.clubId,
              );
              const disabled = disabledIds.includes(player.id);
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(player)}
                    className={cn(
                      "surface-4 w-full min-w-0 p-3 text-start transition-[transform,box-shadow,background-color]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]",
                      !disabled &&
                        "hover:bg-white/90 hover:shadow-card active:translate-y-px",
                      disabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <PlayerDecisionSummary
                      player={player}
                      club={club}
                      clubs={clubs}
                      fixtures={fixtures}
                    />
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
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
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
