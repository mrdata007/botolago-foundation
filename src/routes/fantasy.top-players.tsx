import podiumSoonArt from "@/assets/illustrations/podium-soon.webp";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, Bookmark, Crown, Medal, Share2, Star, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ClubCrest } from "@/components/common/ClubCrest";
import { clubLabel } from "@/components/fantasy/club-identity";
import { GameweekSelector } from "@/components/fantasy/GameweekSelector";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import {
  ui,
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiPill,
  UiStatBlock,
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
import type { FantasyPlayer, TopPlayerOfWeek } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/top-players")({
  head: () => ({
    meta: [
      { title: "Top 5 joueurs de la semaine — BotolaGO" },
      {
        name: "description",
        content: "Les cinq meilleurs joueurs de la journée Fantasy Botola Pro.",
      },
      { property: "og:title", content: "Top 5 joueurs de la semaine — BotolaGO" },
      {
        property: "og:description",
        content: "Les cinq meilleurs joueurs de la journée Fantasy Botola Pro.",
      },
    ],
  }),
  component: TopPlayersFramed,
});

type Enriched = {
  top: TopPlayerOfWeek;
  player: FantasyPlayer;
  club?: Club;
};

/**
 * Top players of the week.
 *
 * The live defect this fixes: for Journée 1 the screen said "Aucun contenu
 * disponible." — the product's generic nothing-here string — in every state.
 * It is not wrong so much as useless: a top five cannot exist for a gameweek
 * whose matches have not been played, which is exactly where the season is,
 * and the reader is left unable to tell "no data yet" from "this page is
 * broken". The empty branch now names the gameweek and says when the top five
 * will appear, and the gameweek selector stays on screen so a reader can move
 * to one that does have results.
 *
 * Also gone: the hardcoded `?? 14` fallback gameweek, which made the screen
 * ask the backend for a gameweek that does not exist in this season whenever
 * the current-gameweek read had not landed yet.
 */
function TopPlayersFramed() {
  const { t } = useI18n();
  return (
    <FantasyFrame>
      <UiHeader
        title={t("fpl.top_players")}
        tone="gradient"
        backTo="/fantasy"
        trailing={<ShareButton />}
      />
      <TopPlayersPage />
    </FantasyFrame>
  );
}

function ShareButton() {
  const { t } = useI18n();

  // navigator.share exists on phones and almost nowhere on the desktop web, so
  // guarding on it and doing nothing else left this button visibly inert for
  // every desktop reader: a press, and no response of any kind. Copying the
  // link is the same intent by another route, and it is what the article and
  // match pages already do.
  const share = async () => {
    const url = typeof window === "undefined" ? "" : window.location.href;
    if (!url) return;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: t("fantasy.top.title"), url });
        return;
      } catch {
        // A dismissed share sheet rejects. That is the reader declining, not a
        // failure, so it must not fall through to copying a link they did not
        // ask for.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("article.share_copied"));
    } catch {
      toast.error(t("fantasy.error.network"));
    }
  };

  return (
    <button
      type="button"
      aria-label={t("article.share")}
      onClick={() => void share()}
      className={cn("grid place-items-center", ui.space.tap, ui.radius.full, ui.focus)}
    >
      <Share2 className="h-4 w-4" aria-hidden />
    </button>
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
        const club = clubsQ.data!.find((c) => c.id === player.clubId);
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
    <div className={cn("px-4 pb-10 pt-3", ui.surface.page)}>
      <p className={cn(ui.text.secondary, ui.tone.muted)}>{t("fantasy.top.subtitle")}</p>

      <div className="mt-3 flex items-center gap-2">
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

          <div className="mb-2 mt-5">
            <UiPill>#2 — #5</UiPill>
          </div>
          <div className="grid gap-3">
            {enriched.slice(1).map((e) => (
              <RankedPlayerCard key={e.player.id} entry={e} tr={tr} t={t} nf={nf} />
            ))}
          </div>

          <div className="mb-2 mt-5">
            <UiPill>{t("fantasy.top.comparison")}</UiPill>
          </div>
          <WeeklyTopPlayersComparison entries={enriched} maxPoints={maxPoints} tr={tr} nf={nf} />
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

function TopPlayerHeroCard({ entry, tr, t, nf }: CardProps) {
  const navigate = useNavigate();
  const watchlist = useWatchlist();
  const { player, club, top } = entry;
  const kit = getKitForClub(club, player.kitPattern);
  const watched = watchlist.isWatched(player.id);

  return (
    <UiCard as="article" className="overflow-hidden">
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-2">
          <span
            className={cn("grid h-10 w-10 place-items-center", ui.radius.full, ui.surface.inkPlain)}
            aria-hidden
          >
            <Crown className="h-4 w-4" aria-hidden />
          </span>
          <JerseyVisual
            kit={kit}
            size={70}
            imageUrl={player.jerseyImageUrl}
            ariaLabel={tr(player.name)}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className={cn("flex items-center gap-1.5", ui.text.label, ui.tone.ink)}>
            <Star className="h-3 w-3 shrink-0" aria-hidden />
            {t("fantasy.top.best_player")}
          </p>
          {/* Same as the player page: the heading follows the page direction
              and the name is its own auto-direction block, cut at its end. */}
          <h2 className={cn("mt-1", ui.text.section, ui.tone.default)}>
            <span dir="auto" className="block w-fit max-w-full truncate">
              {tr(player.name)}
            </span>
          </h2>
          <div className="mt-1 flex items-center gap-2">
            {club ? <ClubCrest club={club} size="sm" /> : null}
            <div className="min-w-0">
              <div dir="auto" className={cn("truncate", ui.text.meta, ui.tone.default)}>
                {club ? tr(club.name) : ""}
              </div>
              <div className={cn(ui.text.label, ui.tone.muted)}>
                {t(`player.pos.${player.position}` as TranslationKey)}
              </div>
            </div>
          </div>
        </div>

        <UiStatBlock
          align="end"
          size="hero"
          tone="ink"
          value={nf.format(top.weeklyPoints)}
          sub={t("fantasy.top.points")}
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <HeroStat label={t("fantasy.top.goals")} value={nf.format(top.goals)} />
        <HeroStat label={t("fantasy.top.assists")} value={nf.format(top.assists)} />
        <HeroStat label={t("fantasy.top.clean_sheets")} value={nf.format(top.cleanSheets)} />
        <HeroStat label={t("fantasy.top.minutes")} value={`${nf.format(top.minutes)}'`} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MetaChip label={t("fantasy.price")} value={nf.format(top.price)} />
        <MetaChip
          label={t("fantasy.top.ownership")}
          value={`${nf.format(top.ownershipPercent)}%`}
        />
        <MetaChip
          label={t("fantasy.top.form")}
          // Unknown form is an en dash; a real 0 stays 0.
          value={top.form === null ? t("fantasy.stat.none") : nf.format(top.form)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <UiButton
          size="sm"
          className="flex-1"
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
    </UiCard>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <UiStatBlock
      align="center"
      label={label}
      value={value}
      className={cn("px-2 py-2", ui.radius.control, ui.surface.sunken)}
    />
  );
}

/**
 * Three of these share a 326px row at 390px, so each is ~103px wide. Minus the
 * padding, the gap and a `shrink-0` value, the label was left with 40px — and
 * `truncate` spent it on four characters: "Sélectionné par" rendered "SÉLE…".
 * A four-of-fifteen-character label is not a designed truncation, and the
 * layout probe could not see it, because it skips anything with a real
 * ellipsis.
 *
 * `flex-wrap` gives the label somewhere to go. Without `truncate` its
 * min-content width is its longest word, so a label that cannot sit beside its
 * value pushes the value onto a second line and reads in full; the short chips
 * ("Prix 9,5", "Forme 8,6") never wrap and are unchanged.
 */
function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-2 py-1.5",
        ui.radius.control,
        ui.surface.sunken,
      )}
    >
      <span className={cn("min-w-0", ui.text.label, ui.tone.muted)}>{label}</span>
      <span className={cn("shrink-0", ui.stat.sm, ui.tone.default)}>{value}</span>
    </div>
  );
}

function RankedPlayerCard({ entry, tr, t, nf }: CardProps) {
  const navigate = useNavigate();
  const { player, club, top } = entry;
  const kit = getKitForClub(club, player.kitPattern);

  const medal =
    top.rank === 2 ? (
      <Medal className="h-4 w-4" aria-hidden />
    ) : top.rank === 3 ? (
      <Award className="h-4 w-4" aria-hidden />
    ) : null;

  return (
    // A plain button rather than `UiCard`: the whole row is the control, and
    // `UiCard` deliberately takes no click handler.
    <button
      type="button"
      onClick={() =>
        void navigate({ to: "/fantasy/players/$playerId", params: { playerId: player.id } })
      }
      className={cn(
        "flex w-full items-center gap-3 p-3 text-start",
        ui.surface.card,
        ui.rule.all,
        ui.focus,
        "transition-transform duration-[var(--duration-tap)] active:translate-y-px",
      )}
    >
      <>
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

        <JerseyVisual
          kit={kit}
          size={40}
          imageUrl={player.jerseyImageUrl}
          ariaLabel={tr(player.name)}
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {club ? <ClubCrest club={club} size="sm" /> : null}
            <span className="min-w-0">
              <span
                dir="auto"
                className={cn(
                  "block truncate",
                  ui.text.body,
                  "[font-weight:var(--ui-weight-heavy)]",
                )}
              >
                {tr(player.name)}
              </span>
              <span dir="auto" className={cn("block truncate", ui.text.label, ui.tone.muted)}>
                {club ? clubLabel(club, tr) : ""} ·{" "}
                {t(`player.pos.${player.position}` as TranslationKey)}
              </span>
            </span>
          </span>
          <span
            className={cn(
              "mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5",
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
              <b className={ui.stat.sm}>{nf.format(top.minutes)}'</b>
            </span>
            <span>
              {t("fantasy.top.form")}{" "}
              <b className={ui.stat.sm}>
                {top.form === null ? t("fantasy.stat.none") : nf.format(top.form)}
              </b>
            </span>
            <span>
              {t("fantasy.top.ownership")}{" "}
              <b className={ui.stat.sm}>{nf.format(top.ownershipPercent)}%</b>
            </span>
          </span>
        </span>

        <UiStatBlock
          align="end"
          size="lg"
          value={nf.format(top.weeklyPoints)}
          sub={t("fantasy.top.points")}
        />
      </>
    </button>
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
    <UiCard className={ui.rule.all}>
      <div className="grid gap-2.5">
        {entries.map((e) => {
          const pct = Math.max(6, Math.round((e.top.weeklyPoints / Math.max(1, maxPoints)) * 100));
          const shortName = tr(e.player.name).split(" ").slice(-1)[0];
          return (
            // The name column is fixed, not `auto`, because every bar has to
            // start at the same x for the comparison to mean anything. 3.5rem
            // was too mean for the league's surnames — "#4 Lamlaoui" is 67px —
            // so it clipped four of the five rows. 5.25rem clears them and
            // still leaves the bar 186px at 390px.
            <div
              key={e.player.id}
              className="grid grid-cols-[5.25rem_1fr_2.5rem] items-center gap-2"
            >
              <div dir="auto" className={cn("truncate", ui.text.micro, ui.tone.default)}>
                #{nf.format(e.top.rank)} {shortName}
              </div>
              <div
                className={cn("relative h-2.5 overflow-hidden", ui.radius.full, ui.surface.sunken)}
              >
                <div
                  className={cn("h-full", ui.radius.full)}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: e.top.rank <= 3 ? "var(--ui-caution)" : "var(--ui-accent-sky)",
                  }}
                  role="progressbar"
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
