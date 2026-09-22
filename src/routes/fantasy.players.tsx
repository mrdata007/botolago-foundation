import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { clubLabel, clubToken } from "@/components/fantasy/club-identity";
import { DifficultyBadge } from "@/components/fantasy/DifficultyBadge";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import {
  ui,
  UiButton,
  UiCard,
  UiChip,
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiInput,
  UiSelect,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useWatchlist } from "@/lib/fantasy-watchlist";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/players")({
  component: PlayersRoute,
});

/**
 * Player stats.
 *
 * Three things this screen does that the previous one did not:
 *
 * 1. **It paginates.** The pool is 539 players and every one of them used to
 *    be in the document: 37,191px of it at a 390px viewport, which is roughly
 *    forty-four screens of scroll and a layout/paint cost paid on every
 *    keystroke in the search box. The data contract is untouched —
 *    `fantasyService.getPlayers()` still reads the pinned
 *    `api.fantasy_player_pool` keyset pages exactly as before — this is a
 *    presentational window over the result it already returns.
 *
 * 2. **It only offers filters that can return something.** The club catalogue
 *    has 21 clubs; 16 of them have players in the pool. Offering the other
 *    five produced a chip that always yielded an empty list and no obvious way
 *    back. The chips are derived from the pool itself, so the filter cannot
 *    outrun the data whatever the catalogue says.
 *
 * 3. **Every filter can be undone where it was set.** Tapping a selected club
 *    or position chip clears it; tapping the active sort flips its direction.
 *    Previously only the "All" chip cleared a club, and no sort could be
 *    reversed.
 */
function PlayersRoute() {
  const isPlayerDetail = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === "/fantasy/players/$playerId"),
  });
  if (isPlayerDetail) return <Outlet />;
  return (
    <FantasyFrame>
      <PlayersPage />
    </FantasyFrame>
  );
}

type SortKey = "points" | "form" | "price" | "ownership";
type SortDir = "asc" | "desc";
const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
const PAGE_SIZE = 25;

/**
 * BG-0071 — form ordering, with "no value yet" (`null`) always sorted below
 * every real number, including a real 0.0, in BOTH directions. Explicit
 * branches rather than a sentinel subtraction: today every player's form is
 * null, and a comparator returning NaN for every pair leaves the list in an
 * unspecified order.
 */
const compareForm = (a: number | null, b: number | null, dir: SortDir) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "desc" ? b - a : a - b;
};

const compareNumber = (a: number, b: number, dir: SortDir) => (dir === "desc" ? b - a : a - b);

function PlayersPage() {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const playersQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });

  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Position | "">("");
  const [clubId, setClubId] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<SortKey>("points");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [compare, setCompare] = useState<string[]>([]); // up to 2
  const watchlist = useWatchlist();

  const toggleCompare = (id: string) => {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id].slice(-2);
    });
  };

  /**
   * Clicking the active sort flips its direction; clicking another selects it
   * at the direction that reads as "best first" for that column.
   */
  const pickSort = (key: SortKey) => {
    if (key === sort) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSort(key);
    setDir("desc");
  };

  const players = useMemo(() => playersQ.data ?? [], [playersQ.data]);

  /**
   * The clubs the filter may offer: the ones that actually have a player in
   * the pool, in catalogue order. Derived, not configured, so a relegated club
   * left `active` in the database can never become a dead-end chip.
   */
  const filterClubs = useMemo(() => {
    const withPlayers = new Set(players.map((p) => p.clubId));
    return (clubsQ.data ?? []).filter((c) => withPlayers.has(c.id));
  }, [players, clubsQ.data]);

  /** Price bands, derived from the pool so they always bracket real values. */
  const priceSteps = useMemo(() => {
    if (players.length === 0) return [];
    const prices = players.map((p) => p.price);
    const lo = Math.ceil(Math.min(...prices));
    const hi = Math.ceil(Math.max(...prices));
    const steps: number[] = [];
    for (let v = lo; v <= hi; v += 1) steps.push(v);
    return steps;
  }, [players]);

  const list = useMemo(() => {
    let l = players.slice();
    if (pos) l = l.filter((p) => p.position === pos);
    if (clubId) l = l.filter((p) => p.clubId === clubId);
    if (maxPrice) l = l.filter((p) => p.price <= Number(maxPrice));
    if (q.trim()) {
      const s = q.toLowerCase();
      l = l.filter((p) => p.name.fr.toLowerCase().includes(s) || p.name.ar.includes(q));
    }
    l.sort((a, b) => {
      if (sort === "price") return compareNumber(a.price, b.price, dir);
      // BG-0071: an unknown form sorts last, below a genuine 0, either way.
      if (sort === "form") return compareForm(a.form, b.form, dir);
      if (sort === "ownership") return compareNumber(a.ownership, b.ownership, dir);
      return compareNumber(a.totalPoints, b.totalPoints, dir);
    });
    return l;
  }, [players, pos, clubId, maxPrice, q, sort, dir]);

  // Any change to the filters or the ordering puts the reader back on page 1;
  // holding page 7 of a board that just shrank to two pages shows nothing.
  useEffect(() => {
    setPage(1);
  }, [q, pos, clubId, maxPrice, sort, dir]);

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const hasFilters = !!(q.trim() || pos || clubId || maxPrice);
  const resetFilters = () => {
    setQ("");
    setPos("");
    setClubId("");
    setMaxPrice("");
  };

  if (playersQ.isError || clubsQ.isError) {
    return (
      <>
        <UiHeader title={t("fpl.player_stats")} tone="gradient" backTo="/fantasy" />
        <div className={cn("px-4 pb-6 pt-3", ui.surface.page)}>
          <UiErrorState
            onRetry={() => {
              void playersQ.refetch();
              void clubsQ.refetch();
            }}
          />
        </div>
      </>
    );
  }
  if (!playersQ.data || !clubsQ.data) {
    return (
      <>
        <UiHeader title={t("fpl.player_stats")} tone="gradient" backTo="/fantasy" />
        <div className={cn("px-4 pb-6 pt-3", ui.surface.page)}>
          <UiStatePanel kind="loading" />
        </div>
      </>
    );
  }

  const clubs = clubsQ.data;
  const clubOf = (cid: string) => clubs.find((c) => c.id === cid);
  const playerOf = (id: string) => players.find((p) => p.id === id);

  const sorts: { k: SortKey; labelKey: TranslationKey }[] = [
    { k: "points", labelKey: "fantasy.picker.sort.points" },
    { k: "form", labelKey: "fantasy.picker.sort.form" },
    { k: "price", labelKey: "fantasy.picker.sort.price" },
    { k: "ownership", labelKey: "fantasy.picker.sort.ownership" },
  ];
  const DirGlyph = dir === "desc" ? ArrowDown : ArrowUp;
  const dirLabel = dir === "desc" ? t("fantasy.players.sort_desc") : t("fantasy.players.sort_asc");

  return (
    <>
      <UiHeader title={t("fpl.player_stats")} tone="gradient" backTo="/fantasy" />
      <div className={cn("px-4 pb-6 pt-3", ui.surface.page)}>
        <UiInput
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("fantasy.picker.search")}
          aria-label={t("fantasy.picker.search")}
        />

        <div
          className="mt-2 flex flex-wrap gap-1"
          role="group"
          aria-label={t("fantasy.players.filter_position")}
        >
          <UiChip selected={pos === ""} onClick={() => setPos("")}>
            {t("common.all")}
          </UiChip>
          {positions.map((p) => (
            <UiChip
              key={p}
              selected={pos === p}
              // Tapping the selected chip clears it.
              onClick={() => setPos((current) => (current === p ? "" : p))}
            >
              {t(`player.pos.${p}` as TranslationKey)}
            </UiChip>
          ))}
        </div>

        {/* One swipeable row, not a wrapping block: with the full league (16
            clubs) a wrap ran to eight rows of chips at 360px and pushed the
            player list below the fold. `-mx-4 px-4` lets the row bleed to the
            screen edge so a half-visible chip signals that it scrolls. */}
        <div
          className="-mx-4 mt-1.5 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]"
          role="group"
          aria-label={t("fantasy.players.filter_club")}
        >
          <UiChip data-club-chip="" selected={clubId === ""} onClick={() => setClubId("")}>
            {t("common.all")}
          </UiChip>
          {filterClubs.map((c) => (
            <UiChip
              key={c.id}
              data-club-chip=""
              selected={clubId === c.id}
              onClick={() => setClubId((current) => (current === c.id ? "" : c.id))}
            >
              {/* The kit's small crest, not squeezed to 20px: at 20px a
                  three-letter fallback ("WAC", "RCA") was cropped mid-letter. */}
              <ClubCrest club={c} size="sm" className="me-1.5" />
              <span className="whitespace-nowrap">{clubLabel(c, tr)}</span>
            </UiChip>
          ))}
        </div>

        {priceSteps.length > 0 ? (
          <UiSelect
            className="mt-2"
            label={t("fantasy.players.price_max")}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            options={[
              { value: "", label: t("fantasy.players.price_any") },
              ...priceSteps.map((v) => ({ value: String(v), label: nf.format(v) })),
            ]}
          />
        ) : null}

        <div
          className="mt-2 flex flex-wrap items-center gap-1"
          role="group"
          aria-label={t("fantasy.picker.sort")}
        >
          <span className={cn(ui.text.label, ui.tone.muted)}>{t("fantasy.picker.sort")}</span>
          {sorts.map((s) => (
            <UiChip
              key={s.k}
              selected={sort === s.k}
              onClick={() => pickSort(s.k)}
              aria-describedby={sort === s.k ? "players-sort-dir" : undefined}
            >
              {t(s.labelKey)}
              {sort === s.k ? <DirGlyph className="ms-1 h-3 w-3 shrink-0" aria-hidden /> : null}
            </UiChip>
          ))}
          <span id="players-sort-dir" className="sr-only">
            {dirLabel}
          </span>
        </div>

        {compare.length === 2 ? (
          <UiCard className="mt-3">
            <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
              {t("fantasy.players.compare_title")}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {compare.map((id) => {
                const p = playerOf(id);
                if (!p) return null;
                const c = clubOf(p.clubId);
                return (
                  <div key={id} className={cn("p-2", ui.radius.control, ui.surface.sunken)}>
                    <div className="flex items-center gap-1.5">
                      {c ? <ClubCrest club={c} size="sm" /> : null}
                      <span
                        dir="auto"
                        className={cn(
                          "truncate",
                          ui.text.meta,
                          "[font-weight:var(--ui-weight-heavy)]",
                        )}
                      >
                        {tr(p.name)}
                      </span>
                    </div>
                    <dl className={cn("mt-2 grid grid-cols-2 gap-1", ui.text.micro)}>
                      <CompareRow label={t("fantasy.price")} value={nf.format(p.price)} />
                      <CompareRow
                        label={t("fantasy.total_points")}
                        value={nf.format(p.totalPoints)}
                      />
                      <CompareRow
                        label={t("fantasy.form")}
                        // A real 0 must read "0"; only an unknown reads "–".
                        value={p.form === null ? t("fantasy.stat.none") : nf.format(p.form)}
                      />
                      <CompareRow
                        label={t("fantasy.ownership")}
                        value={`${nf.format(p.ownership)}%`}
                      />
                      <CompareRow
                        label={t("fantasy.expected_points")}
                        value={
                          p.expectedPoints === null || p.expectedPoints === undefined
                            ? t("fantasy.stat.none")
                            : nf.format(p.expectedPoints)
                        }
                      />
                    </dl>
                  </div>
                );
              })}
            </div>
            <UiButton size="sm" variant="ghost" className="mt-2" onClick={() => setCompare([])}>
              {t("common.reset")}
            </UiButton>
          </UiCard>
        ) : null}
        {compare.length === 1 ? (
          <p
            className={cn(
              "mt-3 px-3 py-2",
              ui.radius.control,
              ui.surface.sunken,
              ui.text.meta,
              ui.tone.muted,
            )}
          >
            {t("fantasy.players.pick_two")}
          </p>
        ) : null}

        <div className="mt-3">
          {list.length === 0 ? (
            <UiEmptyState
              title={t("fantasy.players.no_match")}
              body={t("fantasy.players.empty_filters")}
              action={
                hasFilters ? (
                  <UiButton variant="ink" className="mt-4" onClick={resetFilters}>
                    {t("fantasy.players.reset_filters")}
                  </UiButton>
                ) : undefined
              }
            />
          ) : (
            <>
              <p className={cn("pb-1", ui.text.meta, ui.tone.muted)}>
                {t("fantasy.players.showing")
                  .replace("{n}", nf.format(visible.length))
                  .replace("{total}", nf.format(list.length))}
              </p>
              <ul>
                {visible.map((p) => (
                  <PlayerListRow
                    key={p.id}
                    player={p}
                    club={clubOf(p.clubId)}
                    opponent={p.nextOpponentClubId ? clubOf(p.nextOpponentClubId) : undefined}
                    watched={watchlist.isWatched(p.id)}
                    onToggleWatch={() => watchlist.toggle(p.id)}
                    inCompare={compare.includes(p.id)}
                    onToggleCompare={() => toggleCompare(p.id)}
                    nf={nf}
                  />
                ))}
              </ul>

              <div data-player-pager="" className="mt-3 flex items-center justify-between gap-3">
                <p className={cn("min-w-0", ui.text.meta, ui.tone.muted)}>
                  {t("fantasy.rankings.page")} {nf.format(currentPage)} / {nf.format(pageCount)}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <PagerButton
                    label={t("fantasy.rankings.prev")}
                    disabled={currentPage <= 1}
                    onClick={() => setPage((c) => Math.max(1, c - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </PagerButton>
                  <PagerButton
                    label={t("fantasy.rankings.next")}
                    disabled={currentPage >= pageCount}
                    onClick={() => setPage((c) => Math.min(pageCount, c + 1))}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </PagerButton>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function CompareRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className={ui.tone.muted}>{label}</dt>
      <dd className={cn("text-end", ui.stat.sm, ui.tone.default)}>{value}</dd>
    </>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid place-items-center transition-colors disabled:opacity-40",
        ui.space.tap,
        ui.radius.control,
        ui.rule.all,
        ui.tone.default,
        ui.focus,
      )}
    >
      {children}
    </button>
  );
}

function PlayerListRow({
  player,
  club,
  opponent,
  watched,
  onToggleWatch,
  inCompare,
  onToggleCompare,
  nf,
}: {
  player: FantasyPlayer;
  club?: Club;
  opponent?: Club;
  watched: boolean;
  onToggleWatch: () => void;
  inCompare: boolean;
  onToggleCompare: () => void;
  nf: Intl.NumberFormat;
}) {
  const { t, tr } = useI18n();
  const kit = getKitForClub(club, player.kitPattern);
  return (
    <li data-player-row="" className={cn("flex items-center gap-2 py-2", ui.rule.block)}>
      <Link
        to="/fantasy/players/$playerId"
        params={{ playerId: player.id }}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2",
          "min-h-[var(--ui-tap-min)]",
          ui.radius.control,
          ui.focus,
        )}
      >
        <JerseyVisual kit={kit} size={32} imageUrl={player.jerseyImageUrl} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            {/* `dir="auto"` on the TRUNCATING element, not inside it: the
                ellipsis is placed at the end of the element's own direction,
                so a Latin name inside an inherited RTL box gets clipped at its
                start ("…s de Rabat" instead of "Ittihad Tanger…"). */}
            <span
              dir="auto"
              className={cn("truncate", ui.text.body, "[font-weight:var(--ui-weight-heavy)]")}
            >
              {tr(player.name)}
            </span>
            {player.status !== "available" ? <PlayerStatusBadge status={player.status} /> : null}
          </span>
          <span className={cn("mt-0.5 block truncate", ui.text.micro, ui.tone.muted)}>
            {club ? `${clubLabel(club, tr)} · ` : ""}
            {t(`player.pos.${player.position}` as TranslationKey)} · {t("fantasy.form")}{" "}
            {/* An unknown form is an en dash, never a fabricated 0.0. */}
            {player.form === null ? t("fantasy.stat.none") : nf.format(player.form)} ·{" "}
            {nf.format(player.ownership)}%
          </span>
        </span>
      </Link>

      {opponent && player.nextFixtureDifficulty ? (
        <DifficultyBadge
          difficulty={player.nextFixtureDifficulty}
          label={`${clubToken(opponent, tr)} (${player.nextIsHome ? t("fpl.home_short") : t("fpl.away_short")})`}
          title={`${tr(opponent.name)} (${player.nextIsHome ? t("common.home") : t("common.away")})`}
          className="w-16 shrink-0"
        />
      ) : null}

      <span className="shrink-0 text-end">
        <span className={cn("block", ui.stat.sm, ui.tone.default)}>{nf.format(player.price)}</span>
        <span className={cn("block", ui.text.micro, ui.tone.muted)}>
          {nf.format(player.totalPoints)} {t("fantasy.points.abbr")}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-stretch gap-1">
        <button
          type="button"
          onClick={onToggleWatch}
          aria-pressed={watched}
          aria-label={watched ? t("fantasy.players.remove_watch") : t("fantasy.players.add_watch")}
          className={cn(
            "grid place-items-center",
            ui.space.tap,
            ui.radius.control,
            ui.focus,
            watched ? "text-[color:var(--ui-ink-deep)]" : cn(ui.surface.sunken, ui.tone.muted),
          )}
          style={watched ? { backgroundColor: "var(--ui-caution)" } : undefined}
        >
          <Star className={cn("h-4 w-4", watched && "fill-current")} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onToggleCompare}
          aria-pressed={inCompare}
          className={cn(
            "px-1.5",
            "min-h-[var(--ui-tap-min)]",
            ui.radius.control,
            ui.text.micro,
            "[font-weight:var(--ui-weight-heavy)]",
            ui.focus,
            inCompare ? ui.surface.inkPlain : cn(ui.surface.sunken, ui.tone.muted),
          )}
        >
          {t("fantasy.players.compare")}
        </button>
      </span>
    </li>
  );
}
