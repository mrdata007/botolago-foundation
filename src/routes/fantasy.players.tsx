import noPlayersArt from "@/assets/illustrations/empty-watchlist.webp";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Plus, Scale } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { crestStyle } from "@/components/common/club-crest-style";
import { ListPager } from "@/components/fantasy-lists/ListPager";
import { PlayerKitDisc } from "@/components/fantasy-lists/PlayerKitDisc";
import { SearchField } from "@/components/fantasy-lists/SearchField";
import { clubLabel, findClub, isClubKey } from "@/components/fantasy/club-identity";
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
  UiIconButton,
  UiSelect,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useWatchlist } from "@/lib/fantasy-watchlist";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/players")({
  /**
   * `?compare=<playerId>` — "Comparer" on a player page lands here with that
   * player already picked and compare mode on. Optional, and read once: the
   * list works exactly as before without it.
   */
  validateSearch: (search: Record<string, unknown>): { compare?: string } =>
    typeof search.compare === "string" && search.compare ? { compare: search.compare } : {},
  component: PlayersRoute,
});

/**
 * Player stats (A-Players).
 *
 * Option A: a round search field, the five position chips, the club chips,
 * then "N joueurs sur M" beside the sort control, and the players as one card
 * of rows — each with the club's edge bar, the shirt in a soft disc, the name
 * over "position · club" and "form · selection", the price and points on the
 * tabular stat ramp, and one round control at the end.
 *
 * Three things this screen does, kept from the previous pass:
 *
 * 1. **It paginates.** The pool is 539 players; every one of them used to be
 *    in the document (37,191px at a 390px viewport). The data contract is
 *    untouched — this is a presentational window over what
 *    `fantasyService.getPlayers()` already returns.
 *
 * 2. **It only offers filters that can return something.** The club chips are
 *    derived from the pool itself, so the filter cannot outrun the data.
 *
 * 3. **Every filter can be undone where it was set.** Tapping a selected chip
 *    clears it; the direction control beside the sort flips the order.
 *
 * The round control is the watchlist — "+" to add, a navy check once the
 * player is on the list, `aria-pressed` either way. Comparison keeps its own
 * mode: the scale in the header turns the row control into "compare this
 * player", and the two picked players are laid side by side above the list.
 */
function PlayersRoute() {
  const isPlayerDetail = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === "/fantasy/players/$playerId"),
  });
  if (isPlayerDetail) return <Outlet />;
  return (
    <FantasyFrame bottomNav>
      <PlayersPage />
    </FantasyFrame>
  );
}

type SortKey = "points" | "form" | "price" | "ownership";
type SortDir = "asc" | "desc";
const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
const PAGE_SIZE = 25;
const SORT_KEYS: readonly SortKey[] = ["points", "form", "price", "ownership"];

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
  const { compare: compareFrom } = Route.useSearch();
  const navigate = useNavigate();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  // Prices read "8,0", like the picker and the pitch plates, never "8".
  const priceNf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const pctNf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
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
  const [compare, setCompare] = useState<string[]>(() => (compareFrom ? [compareFrom] : [])); // up to 2
  const [compareMode, setCompareMode] = useState(() => !!compareFrom);
  const watchlist = useWatchlist();

  // The player it came with is now in state; drop it from the URL so a reload
  // or a shared link is the plain list again.
  useEffect(() => {
    if (compareFrom) void navigate({ to: "/fantasy/players", search: {}, replace: true });
  }, [compareFrom, navigate]);

  const toggleCompare = (id: string) => {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id].slice(-2);
    });
  };

  /** A new sort key starts at the direction that reads as "best first". */
  const pickSort = (key: SortKey) => {
    if (key === sort) return;
    setSort(key);
    setDir("desc");
  };

  const players = useMemo(() => playersQ.data ?? [], [playersQ.data]);
  const clubs = useMemo(() => clubsQ.data ?? [], [clubsQ.data]);

  /**
   * The clubs the filter may offer: the ones that actually have a player in
   * the pool, in catalogue order. Derived, not configured, so a relegated club
   * left `active` in the database can never become a dead-end chip. A player
   * row keys its club by id in cloud mode and by slug in mock mode (BG-0111),
   * so both are looked for.
   */
  const filterClubs = useMemo(() => {
    const keys = new Set(players.map((p) => p.clubId));
    return clubs.filter((c) => keys.has(c.id) || (!!c.slug && keys.has(c.slug)));
  }, [players, clubs]);

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
    if (clubId) {
      const club = clubs.find((c) => c.id === clubId);
      if (club) l = l.filter((p) => isClubKey(club, p.clubId));
    }
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
  }, [players, clubs, pos, clubId, maxPrice, q, sort, dir]);

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

  const header = (trailing?: React.ReactNode) => (
    <UiHeader
      kicker={t("nav.fantasy")}
      title={t("fantasy.players.title")}
      backTo="/fantasy"
      trailing={trailing}
    />
  );

  if (playersQ.isError || clubsQ.isError) {
    return (
      <>
        {header()}
        <div className={cn("px-4 pb-6 pt-4", ui.surface.page)}>
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
        {header()}
        <div className={cn("px-4 pb-6 pt-4", ui.surface.page)}>
          <UiStatePanel kind="loading" />
        </div>
      </>
    );
  }

  const clubOf = (key: string) => findClub(clubs, key);
  const playerOf = (id: string) => players.find((p) => p.id === id);

  const sortLabel = (key: SortKey) =>
    key === "form"
      ? t("fantasy.picker.sort.form")
      : key === "price"
        ? t("fantasy.picker.sort.price")
        : key === "ownership"
          ? t("fantasy.picker.sort.ownership")
          : t("fantasy.picker.sort.points");
  const DirGlyph = dir === "desc" ? ArrowDownWideNarrow : ArrowUpNarrowWide;
  const dirLabel = dir === "desc" ? t("fantasy.players.sort_desc") : t("fantasy.players.sort_asc");
  const soft = cn(
    ui.radius.full,
    "w-auto border-transparent bg-[color:var(--ui-surface-sunken)] ps-4",
    ui.text.meta,
    "[font-weight:var(--ui-weight-heavy)]",
  );

  return (
    <>
      {header(
        <UiIconButton
          aria-label={t("fantasy.players.compare")}
          aria-pressed={compareMode}
          variant={compareMode ? "ink" : "soft"}
          onClick={() => setCompareMode((on) => !on)}
        >
          <Scale aria-hidden />
        </UiIconButton>,
      )}
      <div className={cn("space-y-3 px-4 pb-8 pt-4", ui.surface.page)}>
        <SearchField value={q} onChange={setQ} label={t("fantasy.picker.search")} />

        <div
          className="grid grid-cols-5 gap-2"
          role="group"
          aria-label={t("fantasy.players.filter_position")}
        >
          <UiChip className="justify-center px-1" selected={pos === ""} onClick={() => setPos("")}>
            {t("common.all")}
          </UiChip>
          {positions.map((p) => (
            <UiChip
              key={p}
              className="justify-center px-1"
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
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]"
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
              {/* No margin: `UiChip` spaces its children (gap-1.5). */}
              <ClubCrest club={c} size="xs" />
              <span className="whitespace-nowrap">{clubLabel(c, tr)}</span>
            </UiChip>
          ))}
        </div>

        {priceSteps.length > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="players-price"
              className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]", ui.tone.default)}
            >
              {t("fantasy.players.price_max")}
            </label>
            <UiSelect
              id="players-price"
              className="shrink-0"
              fieldClassName={soft}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              options={[
                { value: "", label: t("fantasy.players.price_any") },
                ...priceSteps.map((v) => ({ value: String(v), label: nf.format(v) })),
              ]}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p
            className={cn(
              "min-w-0",
              ui.text.meta,
              "[font-weight:var(--ui-weight-strong)]",
              ui.tone.muted,
            )}
          >
            {list.length > 0
              ? t("fantasy.players.showing")
                  .replace("{n}", nf.format(visible.length))
                  .replace("{total}", nf.format(list.length))
              : null}
          </p>
          <div className="flex items-center gap-1">
            <label
              htmlFor="players-sort"
              className={cn(ui.text.meta, "[font-weight:var(--ui-weight-strong)]", ui.tone.muted)}
            >
              {t("fantasy.picker.sort")}
            </label>
            <UiSelect
              id="players-sort"
              className="shrink-0"
              fieldClassName={soft}
              value={sort}
              onChange={(e) => pickSort(e.target.value as SortKey)}
              options={SORT_KEYS.map((key) => ({ value: key, label: sortLabel(key) }))}
            />
            <UiIconButton
              variant="ghost"
              aria-label={dirLabel}
              onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
            >
              <DirGlyph aria-hidden />
            </UiIconButton>
          </div>
        </div>

        {compare.length === 2 ? (
          <UiCard>
            <div className="flex items-center justify-between gap-3">
              <h2 className={cn("min-w-0 truncate", ui.display.section, ui.tone.default)}>
                {t("fantasy.players.compare_title")}
              </h2>
              <UiButton size="sm" variant="ghost" onClick={() => setCompare([])}>
                {t("common.reset")}
              </UiButton>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {compare.map((id) => {
                const p = playerOf(id);
                if (!p) return null;
                const c = clubOf(p.clubId);
                const form = p.form === null ? t("fantasy.stat.none") : nf.format(p.form);
                return (
                  <div key={id} className={cn("min-w-0 p-3", ui.radius.card, ui.surface.sunken)}>
                    <div className="flex min-w-0 items-center gap-2">
                      {c ? <ClubCrest club={c} size="xs" /> : null}
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
                    <dl
                      className={cn(
                        "mt-2 grid grid-cols-[1fr_auto] gap-x-2 gap-y-1",
                        ui.text.micro,
                      )}
                    >
                      <CompareRow label={t("fantasy.price")} value={priceNf.format(p.price)} />
                      <CompareRow
                        label={t("fantasy.total_points")}
                        value={nf.format(p.totalPoints)}
                      />
                      {/* A real 0 must read "0"; only an unknown reads "–". */}
                      <CompareRow label={t("fantasy.form")} value={form} />
                      <CompareRow
                        label={t("fantasy.ownership")}
                        value={pctNf.format(p.ownership / 100)}
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
          </UiCard>
        ) : null}
        {/* Only in compare mode: outside it the row control is the watchlist,
            and a hint to "pick two" would point at nothing. */}
        {compareMode && compare.length < 2 ? (
          <p
            role="status"
            className={cn(
              "px-4 py-3",
              ui.radius.card,
              ui.surface.sunken,
              ui.text.meta,
              ui.tone.default,
            )}
          >
            {t("fantasy.players.pick_two")}
          </p>
        ) : null}

        {list.length === 0 ? (
          <UiEmptyState
            illustration={noPlayersArt}
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
            <ul className={cn(ui.surface.card, "overflow-hidden")}>
              {visible.map((p, index) => (
                <PlayerListRow
                  key={p.id}
                  player={p}
                  club={clubOf(p.clubId)}
                  last={index === visible.length - 1}
                  watched={watchlist.isWatched(p.id)}
                  onToggleWatch={() => watchlist.toggle(p.id)}
                  compareMode={compareMode}
                  inCompare={compare.includes(p.id)}
                  onToggleCompare={() => toggleCompare(p.id)}
                  nf={nf}
                  priceNf={priceNf}
                  pctNf={pctNf}
                />
              ))}
            </ul>

            <div data-player-pager="">
              <ListPager
                page={currentPage}
                pageCount={pageCount}
                onPrevious={() => setPage((c) => Math.max(1, c - 1))}
                onNext={() => setPage((c) => Math.min(pageCount, c + 1))}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}

function CompareRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className={cn("min-w-0", ui.tone.muted)}>{label}</dt>
      <dd className={cn("text-end", ui.stat.sm, ui.tone.default)}>
        <bdi>{value}</bdi>
      </dd>
    </>
  );
}

function PlayerListRow({
  player,
  club,
  last,
  watched,
  onToggleWatch,
  compareMode,
  inCompare,
  onToggleCompare,
  nf,
  priceNf,
  pctNf,
}: {
  player: FantasyPlayer;
  club?: Club;
  last: boolean;
  watched: boolean;
  onToggleWatch: () => void;
  compareMode: boolean;
  inCompare: boolean;
  onToggleCompare: () => void;
  nf: Intl.NumberFormat;
  priceNf: Intl.NumberFormat;
  pctNf: Intl.NumberFormat;
}) {
  const { t, tr } = useI18n();
  const nameId = useId();
  // The club's colours per theme, memoised per club (the crest's own cache):
  // they paint the edge bar through `--ui-club-edge`.
  const clubColours = club ? crestStyle(club) : undefined;
  // An unknown form is an en dash, never a fabricated 0.0.
  const form = player.form === null ? t("fantasy.stat.none") : nf.format(player.form);
  return (
    <li
      data-player-row=""
      data-club={clubColours?.["data-club"]}
      style={clubColours?.style}
      // The hairline BEFORE the edge: `ui.rule.block` sets the colour of every
      // side, and after the edge it would repaint the club bar in the rule.
      className={cn(
        "flex items-center gap-3 py-2.5 pe-3 ps-3",
        !last && ui.rule.block,
        ui.edge.start,
      )}
    >
      <PlayerKitDisc club={club} kitPattern={player.kitPattern} imageUrl={player.jerseyImageUrl} />
      <Link
        to="/fantasy/players/$playerId"
        params={{ playerId: player.id }}
        className={cn(
          "flex min-w-0 flex-1 flex-col justify-center self-stretch",
          ui.radius.control,
          ui.focus,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {/* `dir="auto"` on the TRUNCATING element, not inside it: the
              ellipsis is placed at the end of the element's own direction,
              so a Latin name inside an inherited RTL box gets clipped at its
              end ("Ittihad Tanger…"), not its start. */}
          <span
            id={nameId}
            dir="auto"
            className={cn(
              "truncate",
              ui.text.body,
              "[font-weight:var(--ui-weight-heavy)]",
              ui.tone.default,
            )}
          >
            {tr(player.name)}
          </span>
          {player.status !== "available" ? (
            <PlayerStatusBadge status={player.status} className="shrink-0" />
          ) : null}
        </span>
        <span
          className={cn(
            "truncate",
            ui.text.meta,
            "[font-weight:var(--ui-weight-strong)]",
            ui.tone.muted,
          )}
        >
          {t(`player.pos.${player.position}` as TranslationKey)}
          {club ? ` · ${clubLabel(club, tr)}` : ""}
        </span>
        <span className={cn("truncate", ui.text.micro, ui.tone.muted)}>
          {t("fantasy.form")} <bdi>{form}</bdi> · {t("fantasy.players.ownership_short")}{" "}
          <bdi>{pctNf.format(player.ownership / 100)}</bdi>
        </span>
      </Link>

      <span className="flex shrink-0 flex-col items-end">
        <span className="flex items-baseline gap-1">
          <bdi className={cn(ui.stat.md, ui.tone.default)}>{priceNf.format(player.price)}</bdi>
          <span
            className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]", ui.tone.default)}
          >
            {t("fantasy.players.price_unit")}
          </span>
        </span>
        <span className={cn(ui.text.meta, ui.tone.muted)}>
          <bdi className={ui.stat.sm}>{nf.format(player.totalPoints)}</bdi>{" "}
          {t("fantasy.points.abbr")}
        </span>
      </span>

      {compareMode ? (
        <UiIconButton
          variant={inCompare ? "ink" : "soft"}
          aria-pressed={inCompare}
          aria-label={t("fantasy.players.compare")}
          aria-describedby={nameId}
          onClick={onToggleCompare}
        >
          {inCompare ? <Check aria-hidden /> : <Scale aria-hidden />}
        </UiIconButton>
      ) : (
        <UiIconButton
          variant={watched ? "ink" : "soft"}
          aria-pressed={watched}
          aria-label={watched ? t("fantasy.players.remove_watch") : t("fantasy.players.add_watch")}
          aria-describedby={nameId}
          onClick={onToggleWatch}
        >
          {watched ? <Check aria-hidden /> : <Plus aria-hidden />}
        </UiIconButton>
      )}
    </li>
  );
}
