import podiumSoonArt from "@/assets/illustrations/podium-soon.webp";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, Bookmark, ChevronRight, Crown, Medal, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { crestStyle } from "@/components/common/club-crest-style";
import { SectionHeader } from "@/components/common/SectionHeader";
import { PlayerKitDisc } from "@/components/fantasy-lists/PlayerKitDisc";
import { ShareButton } from "@/components/fantasy-lists/ShareButton";
import { splitPlayerName } from "@/components/fantasy-lists/player-name";
import { clubLabel, findClub } from "@/components/fantasy/club-identity";
import { GameweekSelector } from "@/components/fantasy/GameweekSelector";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import {
  ui,
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { clubStyle } from "@/lib/club-palette";
import { fantasyHead } from "@/lib/fantasy-meta";
import { useWatchlist } from "@/lib/fantasy-watchlist";
import { cn } from "@/lib/utils";
import { plateName } from "@/components/fpl/plate-name";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, TopPlayerOfWeek } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/top-players")({
  head: () => fantasyHead("topPlayers"),
  component: TopPlayersFramed,
});

type Enriched = {
  top: TopPlayerOfWeek;
  player: FantasyPlayer;
  club?: Club;
};

/**
 * Top players of the week, in the Option A language: the player of the week
 * on a club-colour hero card (the A-Player hero at card size), the next four
 * as one card of rows with their club's edge bar, and the comparison bars in
 * each player's club colour rather than the old amber/sky pair, which said
 * "top three" and "the rest" with colour alone.
 *
 * The live defect this screen fixed stays fixed: for a gameweek that has not
 * been played the empty branch names the gameweek and says when the top five
 * will appear, and the gameweek selector stays on screen so a reader can move
 * to one that does have results. No hardcoded fallback gameweek either.
 */
function TopPlayersFramed() {
  const { t } = useI18n();
  return (
    <FantasyFrame bottomNav>
      <UiHeader
        kicker={t("nav.fantasy")}
        title={t("fpl.top_players")}
        backTo="/fantasy"
        // The share sheet gets the plain title: the copy's `{accent}` markers
        // are page markup and used to reach the share sheet verbatim.
        trailing={<ShareButton title={t("fantasy.top.title").replace(/\{\/?accent\}/g, "")} />}
      />
      <TopPlayersPage />
    </FantasyFrame>
  );
}

function TopPlayersPage() {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const gwQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
  });
  const availableGwsQ = useQuery({
    queryKey: ["top-gws"],
    queryFn: () => fantasyService.getAvailableTopGameweeks(),
  });
  const [gw, setGw] = useState<number | null>(null);

  const availableGws = availableGwsQ.data ?? [];
  const gwMin = availableGws[0] ?? 1;
  const gwMax = availableGws[availableGws.length - 1] ?? gwQ.data?.number ?? gwMin;
  // No magic number: the selection, then the season's current gameweek, then
  // the first gameweek the backend actually knows about.
  const currentGw = gw ?? gwQ.data?.number ?? gwMin;

  const topQ = useQuery({
    queryKey: ["top-players", currentGw],
    queryFn: () => fantasyService.getTopPlayersOfWeek(currentGw),
    enabled: currentGw > 0,
  });
  const playersQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });

  const enriched = useMemo<Enriched[]>(() => {
    if (!topQ.data || !playersQ.data || !clubsQ.data) return [];
    return topQ.data
      .map((top) => {
        const player = playersQ.data!.find((p) => p.id === top.playerId);
        if (!player) return null;
        // By id or slug: the Fantasy rows key clubs by slug in mock mode.
        const club = findClub(clubsQ.data, player.clubId);
        return { top, player, club } as Enriched;
      })
      .filter((x): x is Enriched => x !== null)
      .sort((a, b) => a.top.rank - b.top.rank);
  }, [topQ.data, playersQ.data, clubsQ.data]);

  const maxPoints = enriched[0]?.top.weeklyPoints ?? 1;

  const isLoading =
    topQ.isLoading ||
    playersQ.isLoading ||
    clubsQ.isLoading ||
    gwQ.isLoading ||
    availableGwsQ.isLoading;
  const isError = topQ.isError || playersQ.isError || clubsQ.isError;

  return (
    <div className={cn("px-4 pb-10 pt-4", ui.surface.page)}>
      <p className={cn(ui.text.secondary, ui.tone.muted)}>{t("fantasy.top.subtitle")}</p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={cn(ui.text.label, ui.tone.muted)}>{t("fantasy.top.gw_label")}</span>
        <GameweekSelector value={currentGw} min={gwMin} max={gwMax} onChange={setGw} />
      </div>

      {isLoading ? (
        <div className="mt-6">
          <UiStatePanel kind="loading" />
        </div>
      ) : null}
      {isError && !isLoading ? (
        <div className="mt-6">
          <UiErrorState onRetry={() => void topQ.refetch()} />
        </div>
      ) : null}
      {!isLoading && !isError && enriched.length === 0 ? (
        <div className="mt-6">
          {/* Not "Aucun contenu disponible": a gameweek that has not been
              scored has no top five, and saying so is the whole answer. */}
          <UiEmptyState
            illustration={podiumSoonArt}
            title={t("fantasy.top.empty_title").replace("{n}", nf.format(currentGw))}
            body={t("fantasy.top.empty_body").replace("{n}", nf.format(currentGw))}
          />
        </div>
      ) : null}

      {enriched.length > 0 ? (
        <>
          <div className="mt-4">
            <TopPlayerHeroCard entry={enriched[0]} tr={tr} t={t} nf={nf} />
          </div>

          {enriched.length > 1 ? (
            <section className="mt-6">
              <SectionHeader title={`#2 – #${nf.format(enriched.length)}`} />
              <ul className={cn(ui.surface.card, "overflow-hidden")}>
                {enriched.slice(1).map((e, index) => (
                  <RankedPlayerRow
                    key={e.player.id}
                    entry={e}
                    first={index === 0}
                    tr={tr}
                    t={t}
                    nf={nf}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-6">
            <SectionHeader title={t("fantasy.top.comparison")} />
            <WeeklyTopPlayersComparison entries={enriched} maxPoints={maxPoints} tr={tr} nf={nf} />
          </section>
        </>
      ) : null}
    </div>
  );
}

/* -------------------- Reusable subcomponents -------------------- */

type CardProps = {
  entry: Enriched;
  tr: (v: { fr: string; ar: string }) => string;
  t: (k: TranslationKey) => string;
  nf: Intl.NumberFormat;
};

/** A club's colours as `data-club` + inline vars, memoised per club. */
function coloursOf(club?: Club) {
  return club ? crestStyle(club) : clubStyle(null);
}

/**
 * A share of managers, in the locale's own percent form ("31,5 %", and in
 * Arabic with the marks that keep the sign on the figure's side) — as the
 * players list writes it — rather than a figure with "%" glued on.
 */
function percent(nf: Intl.NumberFormat, value: number) {
  return new Intl.NumberFormat(nf.resolvedOptions().locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value / 100);
}

function TopPlayerHeroCard({ entry, tr, t, nf }: CardProps) {
  const navigate = useNavigate();
  const watchlist = useWatchlist();
  const { player, club, top } = entry;
  const watched = watchlist.isWatched(player.id);
  const name = splitPlayerName(tr(player.name));
  const colours = coloursOf(club);
  const facts = [
    t(`player.pos.${player.position}` as TranslationKey),
    club ? clubLabel(club, tr) : null,
  ].filter(Boolean);

  return (
    <article className={cn("overflow-hidden", ui.surface.card, ui.radius.sheet, ui.shadow.lifted)}>
      {/* The club block: its fill, its measured foreground, its stripes. */}
      <div
        data-club={colours["data-club"]}
        style={colours.style}
        className={cn(ui.club.fill, ui.club.stripes, "p-4")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn("flex items-center gap-1.5", ui.text.label)}>
              <Crown className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{t("fantasy.top.best_player")}</span>
            </p>
            {/* Same as the player page: first name light, family name heavy,
                each its own auto-direction block so a long Latin name is cut
                at its end in Arabic too. */}
            <h2 className="mt-1.5">
              {name.first ? (
                <span
                  dir="auto"
                  className={cn(
                    "block truncate",
                    ui.display.team,
                    "[font-weight:var(--ui-weight-body)]",
                  )}
                >
                  {name.first}
                </span>
              ) : null}
              <span dir="auto" className={cn("block text-balance break-words", ui.display.title)}>
                {name.last}
              </span>
            </h2>
            <p className={cn("mt-1 truncate", ui.text.label)}>{facts.join(" · ")}</p>
          </div>
          {club ? <ClubCrest club={club} size="lg" tone="inverse" /> : null}
        </div>
        <p className="mt-3 flex items-baseline gap-1.5">
          <bdi className={ui.score.lg}>{nf.format(top.weeklyPoints)}</bdi>
          <span className={ui.text.label}>{t("fantasy.top.points")}</span>
        </p>
      </div>

      <div className="p-4">
        <dl className="grid grid-cols-4">
          <HeroStat label={t("fantasy.top.goals")} value={nf.format(top.goals)} />
          <HeroStat label={t("fantasy.top.assists")} value={nf.format(top.assists)} divided />
          <HeroStat
            label={t("fantasy.top.clean_sheets")}
            value={nf.format(top.cleanSheets)}
            divided
          />
          <HeroStat label={t("fantasy.top.minutes")} value={nf.format(top.minutes)} divided />
        </dl>

        <dl className="mt-4 grid grid-cols-3 gap-2">
          <MetaChip label={t("fantasy.price")} value={nf.format(top.price)} />
          <MetaChip label={t("fantasy.top.ownership")} value={percent(nf, top.ownershipPercent)} />
          <MetaChip
            label={t("fantasy.top.form")}
            // Unknown form is an en dash; a real 0 stays 0.
            value={top.form === null ? t("fantasy.stat.none") : nf.format(top.form)}
          />
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {/* `flex-auto`, not `flex-1`: a zero basis let the row squeeze this
              pill to 51px beside the other two. It grows into the room left on
              its line but never below its one-line label; when the three do
              not fit, the row wraps. */}
          <UiButton
            size="sm"
            className="flex-auto"
            onClick={() =>
              void navigate({ to: "/fantasy/players/$playerId", params: { playerId: player.id } })
            }
          >
            {t("fantasy.top.view_player")}
          </UiButton>
          <UiButton
            size="sm"
            variant="outline"
            aria-pressed={watched}
            onClick={() => watchlist.toggle(player.id)}
          >
            <Bookmark className={cn("h-4 w-4", watched && "fill-current")} aria-hidden />
            {watched ? t("fantasy.players.remove_watch") : t("fantasy.top.add_watchlist")}
          </UiButton>
          <UiButton
            size="sm"
            variant="outline"
            onClick={() => void navigate({ to: "/fantasy/transfers" })}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            {t("fantasy.top.transfer_in")}
          </UiButton>
        </div>
      </div>
    </article>
  );
}

/** One of the hero's four match figures: the number over its label, split by a logical rule. */
function HeroStat({
  label,
  value,
  divided = false,
}: {
  label: string;
  value: string;
  divided?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col-reverse items-center justify-end gap-0.5 px-1 text-center",
        divided && ui.rule.inline,
      )}
    >
      <dt className={cn("max-w-full text-balance", ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd className={cn(ui.stat.lg, ui.tone.default)}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}

/**
 * Three of these share a 326px row at 390px, so each is ~103px wide. A label
 * that cannot sit beside its value wraps above it and reads in full ("SÉLE…"
 * was a four-of-fifteen-character truncation), and the short ones ("Prix
 * 9,5", "Forme 8,6") never wrap.
 */
function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-3 py-2",
        ui.radius.card,
        ui.surface.sunken,
      )}
    >
      <dt className={cn("min-w-0", ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd className={cn("shrink-0", ui.stat.sm, ui.tone.default)}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}

function RankedPlayerRow({ entry, first, tr, t, nf }: CardProps & { first: boolean }) {
  const navigate = useNavigate();
  const { player, club, top } = entry;
  const colours = coloursOf(club);

  const medal =
    top.rank === 2 ? (
      <Medal className="h-4 w-4" aria-hidden />
    ) : top.rank === 3 ? (
      <Award className="h-4 w-4" aria-hidden />
    ) : null;

  return (
    <li
      data-club={colours["data-club"]}
      style={colours.style}
      className={cn(!first && ui.rule.blockStart)}
    >
      {/* The whole row is the control; the edge bar is the club's. */}
      <button
        type="button"
        onClick={() =>
          void navigate({ to: "/fantasy/players/$playerId", params: { playerId: player.id } })
        }
        className={cn(
          "flex w-full items-center gap-3 py-3 pe-3 ps-3 text-start",
          ui.edge.start,
          ui.focus,
          "focus-visible:ring-inset focus-visible:ring-offset-0",
        )}
      >
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center",
            ui.radius.full,
            ui.surface.sunken,
            ui.stat.sm,
          )}
          aria-hidden
        >
          {medal ?? `#${nf.format(top.rank)}`}
        </span>

        <PlayerKitDisc
          club={club}
          kitPattern={player.kitPattern}
          imageUrl={player.jerseyImageUrl}
        />

        <span className="min-w-0 flex-1">
          <span
            dir="auto"
            className={cn("block truncate", ui.text.body, "[font-weight:var(--ui-weight-heavy)]")}
          >
            {tr(player.name)}
          </span>
          <span dir="auto" className={cn("block truncate", ui.text.meta, ui.tone.muted)}>
            {t(`player.pos.${player.position}` as TranslationKey)}
            {club ? ` · ${clubLabel(club, tr)}` : ""}
          </span>
          <span
            className={cn(
              "mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5",
              ui.text.micro,
              ui.tone.muted,
            )}
          >
            <span>
              <b className={ui.stat.sm}>{nf.format(top.goals)}</b> {t("fantasy.top.goals")}
            </span>
            <span>
              <b className={ui.stat.sm}>{nf.format(top.assists)}</b> {t("fantasy.top.assists")}
            </span>
            <span>
              <b className={ui.stat.sm}>{nf.format(top.cleanSheets)}</b>{" "}
              {t("fantasy.top.clean_sheets")}
            </span>
            <span>
              <b className={ui.stat.sm}>{nf.format(top.minutes)}</b> {t("home.minutes")}
            </span>
            <span>
              {t("fantasy.top.form")}{" "}
              <b className={ui.stat.sm}>
                {top.form === null ? t("fantasy.stat.none") : nf.format(top.form)}
              </b>
            </span>
            <span>
              {t("fantasy.top.ownership")}{" "}
              <b className={ui.stat.sm}>{percent(nf, top.ownershipPercent)}</b>
            </span>
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end">
          <bdi className={cn(ui.stat.lg, ui.tone.default)}>{nf.format(top.weeklyPoints)}</bdi>
          <span className={cn(ui.text.micro, ui.tone.muted)}>{t("fantasy.top.points")}</span>
        </span>
        <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
      </button>
    </li>
  );
}

function WeeklyTopPlayersComparison({
  entries,
  maxPoints,
  tr,
  nf,
}: {
  entries: Enriched[];
  maxPoints: number;
  tr: (v: { fr: string; ar: string }) => string;
  nf: Intl.NumberFormat;
}) {
  return (
    <UiCard>
      <div className="grid gap-3">
        {entries.map((e) => {
          const pct = Math.max(6, Math.round((e.top.weeklyPoints / Math.max(1, maxPoints)) * 100));
          // The plate's surname rule: "عطية الله", not a bare "الله".
          const shortName = plateName(tr(e.player.name));
          const colours = coloursOf(e.club);
          return (
            // The name column is fixed, not `auto`, because every bar has to
            // start at the same x for the comparison to mean anything. 5.25rem
            // clears the league's surnames ("#4 Lamlaoui" is 67px) and still
            // leaves the bar ~186px at 390px.
            <div
              key={e.player.id}
              data-club={colours["data-club"]}
              style={colours.style}
              className="grid grid-cols-[5.25rem_1fr_2.5rem] items-center gap-2"
            >
              <div dir="auto" className={cn("truncate", ui.text.micro, ui.tone.default)}>
                #{nf.format(e.top.rank)} {shortName}
              </div>
              <div
                className={cn("relative h-2.5 overflow-hidden", ui.radius.full, ui.surface.sunken)}
              >
                {/* The club's edge colour: ≥ 3:1 on the card, so a white or
                    yellow kit is still a visible bar. */}
                <div
                  className={cn("h-full", ui.radius.full, ui.club.edgeFill)}
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-label={tr(e.player.name)}
                  aria-valuemin={0}
                  aria-valuemax={maxPoints}
                  aria-valuenow={e.top.weeklyPoints}
                />
              </div>
              <div className={cn("text-end", ui.stat.sm, ui.tone.default)}>
                {nf.format(e.top.weeklyPoints)}
              </div>
            </div>
          );
        })}
      </div>
    </UiCard>
  );
}
