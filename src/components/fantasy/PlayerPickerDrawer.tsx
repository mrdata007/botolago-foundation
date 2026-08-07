import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Search } from "lucide-react";

import { ClubCrest } from "@/components/common/ClubCrest";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, FixtureDifficulty, Position } from "@/types/fantasy";
import { PlayerStatusBadge } from "./PlayerStatusBadge";

type SortKey = "price";
type AvailabilityFilter = "all" | "available" | "flagged" | "unavailable";

export function isPlayerIntrinsicallyBlocked(
  player: Pick<FantasyPlayer, "status">,
): boolean {
  return player.status === "ineligible" || player.status === "unavailable";
}

export function PlayerPickerDrawer({
  open,
  onClose,
  onPick,
  players,
  clubs,
  position,
  disabledIds = [],
  disabledReasonFor,
  maxPrice,
  title,
  inspectBeforePick = false,
  fixtures = [],
  gameweek,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (p: FantasyPlayer) => void;
  players: FantasyPlayer[];
  clubs: Club[];
  position?: Position;
  disabledIds?: string[];
  disabledReasonFor?: (player: FantasyPlayer) => string | null;
  maxPrice?: number;
  title?: string;
  inspectBeforePick?: boolean;
  fixtures?: FixtureDifficulty[];
  gameweek?: number;
}) {
  const { t, tr, lang, dir } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    maximumFractionDigits: 1,
  });
  const [q, setQ] = useState("");
  const [clubId, setClubId] = useState<string>("");
  const [pos, setPos] = useState<Position | "">(position ?? "");
  const [sort, setSort] = useState<SortKey>("price");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const absoluteMax = Math.max(0, ...players.map((player) => player.price));
  const affordableMax = Math.min(maxPrice ?? absoluteMax, absoluteMax);
  const [priceCap, setPriceCap] = useState(affordableMax);

  useEffect(() => {
    setPos(position ?? "");
    setPriceCap(affordableMax);
    setDetailId(null);
  }, [affordableMax, open, position]);

  const filtered = useMemo(() => {
    let list = players.slice();
    if (position) list = list.filter((player) => player.position === position);
    else if (pos) list = list.filter((player) => player.position === pos);
    if (clubId) list = list.filter((player) => player.clubId === clubId);
    if (q.trim()) {
      const normalized = q.trim().toLocaleLowerCase(lang === "ar" ? "ar" : "fr");
      list = list.filter(
        (player) =>
          player.name.fr.toLocaleLowerCase("fr").includes(normalized) ||
          player.name.ar.includes(q.trim()),
      );
    }
    if (availability === "available") {
      list = list.filter((player) => player.status === "available");
    } else if (availability === "flagged") {
      list = list.filter((player) => ["injured", "doubtful", "suspended"].includes(player.status));
    } else if (availability === "unavailable") {
      list = list.filter((player) => ["ineligible", "unavailable"].includes(player.status));
    }
    list = list.filter((player) => player.price <= priceCap + 0.001);
    list.sort((a, b) => {
      const priceOrder = b.price - a.price;
      if (priceOrder !== 0) return priceOrder;
      return tr(a.name).localeCompare(tr(b.name), lang);
    });
    return list;
  }, [availability, clubId, lang, players, pos, position, priceCap, q, sort, tr]);

  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  const sorts: { key: SortKey; labelKey: TranslationKey }[] = [
    { key: "price", labelKey: "fantasy.picker.sort.price" },
  ];
  const detail = detailId ? players.find((player) => player.id === detailId) : null;
  const detailClub = detail ? clubs.find((club) => club.id === detail.clubId) : null;
  const detailFixture = detail
    ? fixtures.find(
        (fixture) =>
          fixture.clubId === detail.clubId &&
          (typeof gameweek !== "number" || fixture.gameweek === gameweek),
      )
    : null;
  const detailOpponent = detailFixture
    ? clubs.find((club) => club.id === detailFixture.opponentClubId)
    : null;
  const disabledReason = detail
    ? (isPlayerIntrinsicallyBlocked(detail)
        ? t("fantasy.atlas.create.picker.block.unavailable")
        : (disabledReasonFor?.(detail) ??
          (disabledIds.includes(detail.id)
            ? t("fantasy.atlas.create.picker.already_selected")
            : null)))
    : null;
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        className={cn(
          "max-h-[92dvh] w-full overflow-hidden px-4 pb-4 pt-5 sm:inset-y-0 sm:h-full sm:max-h-none sm:w-[440px] sm:max-w-[440px] sm:rounded-none sm:px-5 sm:pt-6",
          dir === "rtl"
            ? "sm:left-0 sm:right-auto sm:rounded-r-none sm:rounded-l-[var(--radius-sheet)]"
            : "sm:right-0 sm:left-auto sm:rounded-l-none sm:rounded-r-[var(--radius-sheet)]",
        )}
      >
        {detail ? (
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="pe-12 text-start">
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="mb-2 inline-flex min-h-10 w-fit items-center gap-2 rounded-xl px-2 text-xs font-black text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <Back className="h-4 w-4" aria-hidden />
                {t("common.back")}
              </button>
              <SheetTitle>{tr(detail.name)}</SheetTitle>
              <SheetDescription>{t("fantasy.atlas.create.picker.details")}</SheetDescription>
            </SheetHeader>
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
              <div className="rounded-3xl bg-[#071d40] p-5 text-white">
                <div className="flex items-center gap-4">
                  {detailClub && (
                    <ClubCrest club={detailClub} size="lg" className="h-16 w-16 rounded-2xl" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xl font-black">{tr(detail.name)}</div>
                    <div className="mt-1 text-sm text-white/65">
                      {detailClub ? tr(detailClub.name) : ""} ·{" "}
                      {t(`player.pos.${detail.position}` as TranslationKey)}
                    </div>
                    {detail.status !== "available" && (
                      <div className="mt-2">
                        <PlayerStatusBadge status={detail.status} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2">
                <Metric label={t("fantasy.picker.sort.price")} value={nf.format(detail.price)} />
                {typeof detail.chanceOfPlaying === "number" && (
                  <Metric
                    label={t("fantasy.atlas.create.picker.chance")}
                    value={`${detail.chanceOfPlaying}%`}
                  />
                )}
                {typeof detail.expectedPoints === "number" && (
                  <Metric label={t("fantasy.xpts")} value={nf.format(detail.expectedPoints)} />
                )}
              </dl>
              {detail.news && (
                <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
                  {tr(detail.news)}
                </p>
              )}
              {detailFixture && detailOpponent && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                  <ClubCrest club={detailOpponent} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("fantasy.atlas.create.review.next_fixture")}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-black">
                      {tr(detailOpponent.name)} ·{" "}
                      {detailFixture.isHome ? t("common.home") : t("common.away")}
                    </div>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-xs font-black text-blue-800">
                    {detailFixture.difficulty}
                  </span>
                </div>
              )}
              {disabledReason && (
                <p
                  role="status"
                  className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-800"
                >
                  {disabledReason}
                </p>
              )}
            </div>
            <button
              type="button"
              data-testid="atlas-player-add"
              disabled={!!disabledReason}
              onClick={() => onPick(detail)}
              className={cn(
                "mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black",
                disabledReason ? "cursor-not-allowed bg-slate-200 text-slate-500" : "cta-brand",
              )}
            >
              <Check className="h-4 w-4" aria-hidden />
              {t("fantasy.atlas.create.picker.add")}
            </button>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="pe-12 text-start">
              <SheetTitle>{title ?? t("fantasy.picker.title")}</SheetTitle>
              <SheetDescription>{t("fantasy.atlas.create.picker.description")}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-3">
              <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder={t("fantasy.picker.search")}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>

              {!position && (
                <div
                  className="flex flex-wrap gap-1.5"
                  aria-label={t("fantasy.atlas.create.picker.position_filter")}
                >
                  <FilterChip active={pos === ""} onClick={() => setPos("")}>
                    {t("common.all")}
                  </FilterChip>
                  {positions.map((item) => (
                    <FilterChip key={item} active={pos === item} onClick={() => setPos(item)}>
                      {t(`player.pos.${item}` as TranslationKey)}
                    </FilterChip>
                  ))}
                </div>
              )}

              <div
                className="flex gap-1.5 overflow-x-auto pb-1"
                aria-label={t("fantasy.atlas.create.picker.club_filter")}
              >
                <FilterChip active={clubId === ""} onClick={() => setClubId("")}>
                  {t("common.all")}
                </FilterChip>
                {clubs.map((club) => (
                  <FilterChip
                    key={club.id}
                    active={clubId === club.id}
                    onClick={() => setClubId(club.id)}
                  >
                    <ClubCrest club={club} size="sm" className="h-5 w-5 rounded-full text-[8px]" />
                    {tr(club.shortName)}
                  </FilterChip>
                ))}
              </div>

              <div
                className="flex flex-wrap gap-1.5"
                aria-label={t("fantasy.atlas.create.picker.availability_filter")}
              >
                {(["all", "available", "flagged", "unavailable"] as AvailabilityFilter[]).map(
                  (item) => (
                    <FilterChip
                      key={item}
                      active={availability === item}
                      onClick={() => setAvailability(item)}
                    >
                      {t(`fantasy.atlas.create.picker.availability.${item}` as TranslationKey)}
                    </FilterChip>
                  ),
                )}
              </div>

              <label className="block rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                <span className="flex items-center justify-between gap-2">
                  <span>{t("fantasy.atlas.create.picker.price_cap")}</span>
                  <strong className="tabular-nums">{nf.format(priceCap)}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(affordableMax, 1)}
                  step={0.1}
                  value={Math.min(priceCap, Math.max(affordableMax, 1))}
                  onChange={(event) => setPriceCap(Number(event.target.value))}
                  className="mt-2 w-full accent-blue-600"
                />
              </label>

              <div className="flex flex-wrap items-center gap-1.5">
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

            <p
              className="mt-3 text-xs font-bold text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {t("fantasy.atlas.create.picker.results").replace("{count}", String(filtered.length))}
            </p>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pe-1">
              {filtered.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                  {t("state.empty")}
                </div>
              ) : (
                <ul className="grid gap-2">
                  {filtered.map((player) => {
                    const club = clubs.find((candidate) => candidate.id === player.clubId);
                    const reason = isPlayerIntrinsicallyBlocked(player)
                      ? t("fantasy.atlas.create.picker.block.unavailable")
                      : (disabledReasonFor?.(player) ??
                        (disabledIds.includes(player.id)
                          ? t("fantasy.atlas.create.picker.already_selected")
                          : null));
                    return (
                      <li key={player.id}>
                        <button
                          type="button"
                          data-testid="atlas-player-row"
                          data-player-selectable={reason ? "false" : "true"}
                          onClick={() => {
                            if (inspectBeforePick) setDetailId(player.id);
                            else if (!reason) onPick(player);
                          }}
                          aria-describedby={reason ? `picker-reason-${player.id}` : undefined}
                          className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-black/5 bg-white px-3 py-2 text-start shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          {club && <ClubCrest club={club} size="md" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-black text-foreground">
                                {tr(player.name)}
                              </span>
                              {player.status !== "available" && (
                                <PlayerStatusBadge status={player.status} />
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {t(`player.pos.${player.position}` as TranslationKey)}
                            </div>
                            {reason && (
                              <div
                                id={`picker-reason-${player.id}`}
                                className="mt-1 truncate text-[10px] font-bold text-red-700"
                              >
                                {reason}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-end">
                            <div className="text-sm font-black tabular-nums">
                              {nf.format(player.price)}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
        active
          ? "bg-[color:var(--brand-primary)] text-white"
          : "bg-white text-foreground ring-1 ring-black/8 hover:bg-slate-50",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-black tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
