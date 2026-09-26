import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { pp } from "./pepites-design";
import {
  editionItems,
  formatCount,
  formatNumber,
  playerPhotoUrl,
  positionLabel,
  scoreText,
} from "./pepites-format";
import { PepitesErrorState, PepitesLoadingState } from "./PepitesParts";
import { GoMark, PepitesShirt } from "./PepitesVisuals";
import {
  homeQueryOptions,
  pointerVersion,
  rankingStatsQueryOptions,
  statsByPlayer,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";

/** "LUN. 20:00": the reveal's day and hour, in Morocco time. */
function revealStamp(iso: string | null, lang: "fr" | "ar"): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const day = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    weekday: lang === "ar" ? "long" : "short",
    timeZone: "Africa/Casablanca",
  }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Casablanca",
  }).format(date);
  return `${lang === "ar" ? day : day.toLocaleUpperCase("fr")} ${time}`;
}

/**
 * `/pepites/revelation` (Figma 06): the week's Top 10 as a story, from N°10
 * to N°1, one player a screen: the photo or the club shirt, the name, three
 * figures and the editor's line. Full-screen, like a story; the mark goes
 * back to Pépites. Only a published edition has one.
 */
export function PepitesReveal({ rank }: { rank: number }) {
  const { t, tr, lang } = useI18n();
  const viewer = usePepitesViewer();
  const pointerQuery = useVersionPointer(viewer);
  const pointer = pointerQuery.data;
  const version = pointerVersion(pointer);
  const open = pointer?.available === true && version !== null;
  const home = useQuery({ ...homeQueryOptions(viewer, version), enabled: open });
  const ranking = useQuery({ ...rankingStatsQueryOptions(viewer, version), enabled: open });
  const stats = useMemo(() => statsByPlayer(ranking.data), [ranking.data]);

  if (pointerQuery.isPending || (open && home.isPending)) {
    return <PepitesLoadingState onRetry={() => void pointerQuery.refetch()} />;
  }
  if (pointerQuery.isError && !pointer) {
    return <PepitesErrorState onRetry={() => void pointerQuery.refetch()} />;
  }
  const data = home.data;
  const edition = data?.available && data.source === "edition" ? (data.edition ?? null) : null;
  const items = edition ? editionItems(edition.entries).sort((a, b) => b.rank - a.rank) : [];
  const index = items.findIndex((item) => item.rank === rank);
  const item = items[index === -1 ? 0 : index];

  if (!pointer?.available || !edition || !item) {
    return (
      <div
        className={cn("flex min-h-dvh flex-col items-center justify-center gap-4 p-6", pp.night)}
      >
        <GoMark />
        <p className="text-center text-[15px] text-white/80" data-testid="pepites-reveal-none">
          {t("pepites.reveal.none")}
        </p>
        <Link
          to="/pepites"
          className={cn("rounded-full px-6 py-3 text-[13px]", pp.heavy, primaryButton)}
        >
          {t("pepites.tab.top")}
        </Link>
      </div>
    );
  }

  const player = item.player;
  const row = stats.get(player.id);
  const photoUrl = playerPhotoUrl(player);
  const reason = lang === "ar" ? item.reasonAr : item.reasonFr;
  const current = index === -1 ? 0 : index;
  const next = items[current + 1] ?? null;
  const meta = [
    player.team ? tr(player.team.name) : null,
    player.positionGroup ? positionLabel(player.positionGroup, t) : null,
    typeof player.age === "number"
      ? t("pepites.meta.age_long").replace("{n}", formatNumber(player.age, lang))
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const tiles = [
    { value: scoreText(item.score, lang, t("pepites.unranked")), label: t("pepites.score_name") },
    {
      value: row ? `${formatCount(row.minutes, lang)}’` : "–",
      label: t("pepites.fact.minutes"),
    },
    {
      value: row?.formAvg != null ? formatNumber(row.formAvg, lang, 2) : "–",
      label: t("pepites.reveal.form"),
    },
  ];

  return (
    <main
      className="relative flex min-h-dvh flex-col overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(195px 527.5px at 50% 56.25%, #1e4fa0 0%, #0d1738 55%, #070d24 100%)",
      }}
      data-testid="pepites-reveal"
    >
      <span
        aria-hidden
        className={cn(
          pp.display,
          "pointer-events-none absolute start-1/2 top-[70px] -translate-x-[60%] select-none text-[330px] leading-none text-transparent rtl:translate-x-[60%]",
          "origin-top-left [transform:skewX(-7.97deg)_scaleY(0.99)]",
        )}
        style={{ WebkitTextStroke: "1.5px rgb(255 255 255 / 0.12)" }}
      >
        {formatNumber(item.rank, lang)}
      </span>
      <div className="relative z-10 mx-auto flex w-full max-w-[430px] flex-1 flex-col px-4 pb-6 pt-[max(env(safe-area-inset-top),16px)]">
        <ol
          className="mt-8 flex gap-1"
          aria-label={t("pepites.reveal.progress")
            .replace("{n}", formatNumber(current + 1, lang))
            .replace("{total}", formatNumber(items.length, lang))}
        >
          {items.map((entry, position) => (
            <li
              key={entry.player.id}
              aria-hidden
              className={cn(
                "h-[3px] flex-1 rounded-[2px]",
                position <= current ? "bg-white" : "bg-white/30",
              )}
            />
          ))}
        </ol>
        <div className="mt-3 flex items-center justify-between gap-3">
          <GoMark />
          <p
            className={cn(
              pp.mono,
              "text-[9px] text-[color:var(--pepites-on-night-sub)] ltr:tracking-[0.08em]",
            )}
          >
            {t("pepites.reveal.stamp").replace("{time}", revealStamp(edition.publishedAt, lang))}
          </p>
        </div>

        <div className="relative mt-auto flex flex-col items-center">
          <div className="relative z-10 flex h-[230px] w-[230px] items-end justify-center">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="size-[230px] rounded-[28px] object-cover drop-shadow-[0_10px_16px_rgba(0,0,0,0.5)]"
                data-testid="pepites-reveal-photo"
              />
            ) : (
              <PepitesShirt player={player} number={item.rank} className="h-[200px] w-[214px]" />
            )}
          </div>
          <span
            aria-hidden
            className={cn(
              "relative z-10 -mt-1 block h-1 w-[170px] origin-top-left [transform:skewX(-7.97deg)]",
              pp.energyFill,
            )}
          />
          <h1
            className={cn(pp.display, "relative z-10 mt-3 text-center text-[32px] leading-[1.1]")}
            data-testid="pepites-reveal-name"
          >
            <bdi>{player.name}</bdi>
          </h1>
          <p
            className={cn(
              pp.mono,
              "relative z-10 mt-1 text-center text-[10px] text-[color:var(--pepites-on-night-sub)] ltr:tracking-[0.06em]",
            )}
          >
            {meta}
          </p>
          <span className="sr-only">
            {t("pepites.hero.rank_line").replace("{n}", formatNumber(item.rank, lang))}
          </span>
        </div>

        <dl className="relative z-10 mt-4 grid grid-cols-3 gap-2">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="flex flex-col items-center gap-[3px] rounded-[12px] border border-white/15 bg-white/[0.08] py-2.5"
            >
              <dd className={cn(pp.display, "order-1 text-[22px]")}>
                <bdi>{tile.value}</bdi>
              </dd>
              <dt
                className={cn(
                  pp.monoStrong,
                  "order-2 text-[8px] text-[color:var(--pepites-on-night-sub)] ltr:tracking-[0.1em]",
                )}
              >
                {tile.label}
              </dt>
            </div>
          ))}
        </dl>
        {reason ? (
          <p
            className={cn(pp.bold, "mt-4 text-center text-[12px] leading-[1.45] text-[#e4e9f7]")}
            data-testid="pepites-reveal-reason"
          >
            «&nbsp;{reason}&nbsp;»
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link
            to="/pepites/joueur/$playerId"
            params={{ playerId: player.id }}
            className={cn(
              "inline-flex h-[42px] items-center justify-center rounded-full px-4 text-[13px]",
              pp.heavy,
              primaryButton,
            )}
          >
            {t("pepites.reveal.open_player")}
          </Link>
          {next ? (
            <Link
              to="/pepites/revelation"
              search={{ n: next.rank }}
              replace
              data-testid="pepites-reveal-next"
              className={cn(
                "inline-flex h-[42px] items-center justify-center rounded-full border border-white/20 bg-white/[0.08] px-4 text-[13px] text-white",
                pp.heavy,
                ui.focusOnMesh,
              )}
            >
              {t("pepites.reveal.next").replace("{n}", formatNumber(next.rank, lang))}
            </Link>
          ) : (
            <Link
              to="/pepites"
              data-testid="pepites-reveal-done"
              className={cn(
                "inline-flex h-[42px] items-center justify-center rounded-full border border-white/20 bg-white/[0.08] px-4 text-[13px] text-white",
                pp.heavy,
                ui.focusOnMesh,
              )}
            >
              {t("pepites.reveal.done")}
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

/** Figma "Button / primary": the vertical spring-to-sky fill, dark ink. */
const primaryButton =
  "bg-[linear-gradient(to_bottom,#7df0ac,#8fe3f2)] text-[#0d1f4a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";
