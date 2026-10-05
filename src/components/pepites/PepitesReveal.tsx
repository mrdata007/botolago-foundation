import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

import { ui, UiButton, UiCard, UiEmptyState, UiLinkButton, UiStatBlock } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";

import {
  editionItems,
  formatCount,
  formatNumber,
  playerPhotoUrl,
  positionLabel,
  scoreText,
  teamAsClub,
} from "./pepites-format";
import { PepitesErrorState, PepitesLoadingState } from "./PepitesParts";
import { PepitesBack, PepitesShell } from "./PepitesShell";
import { PepitesShirt } from "./PepitesVisuals";
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
  const day = moroccoDateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    weekday: lang === "ar" ? "long" : "short",
  }).format(date);
  const time = moroccoDateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${lang === "ar" ? day : day.toLocaleUpperCase("fr")} ${time}`;
}

/**
 * The arrow glyph that ends the "next" label in the dictionaries (U+2192 in
 * French, U+2190 in Arabic). The button draws the arrow as a lucide icon
 * instead, which styles.css mirrors in Arabic, so the glyph is cut here. A
 * no-op once the copy drops it.
 */
const TRAILING_ARROW = /\s*[\u2190\u2192]\s*$/;

/**
 * `/pepites/revelation` (Figma 06): the week's Top 10 as a story, from N°10
 * to N°1, one player a screen: the photo or the club shirt, the name, three
 * figures and the editor's line. Full-screen, like a story, on the main
 * design (BG-0152): the light page, a card that turns over (its back is the
 * rank on the player's club colour, its front the photo or the shirt), kit
 * figures and buttons. The back pill returns to Pépites. Only a published
 * edition has one.
 */
export function PepitesReveal({ rank }: { rank: number }) {
  const { t, tr, lang } = useI18n();
  const navigate = useNavigate();
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
      <PepitesShell>
        <UiEmptyState
          testId="pepites-reveal-none"
          title={t("pepites.reveal.none")}
          action={
            <UiLinkButton to="/pepites" variant="ink" size="sm" className="mt-4">
              {t("pepites.tab.top")}
            </UiLinkButton>
          }
        />
      </PepitesShell>
    );
  }

  const player = item.player;
  const row = stats.get(player.id);
  const photoUrl = playerPhotoUrl(player);
  const reason = lang === "ar" ? item.reasonAr : item.reasonFr;
  const current = index === -1 ? 0 : index;
  const next = items[current + 1] ?? null;
  const colours = clubStyle(teamAsClub(player.team));
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
    <main className={cn("flex min-h-dvh flex-col", ui.surface.page)} data-testid="pepites-reveal">
      {/* No top bar here, so the page keeps clear of the notch and the home
          indicator itself. */}
      <div
        className={cn(
          "flex flex-1 flex-col pb-[max(env(safe-area-inset-bottom),1.5rem)]",
          ui.space.column,
          ui.space.gutter,
          ui.safe.top,
        )}
      >
        <ol
          className="mt-2 flex gap-1"
          aria-label={t("pepites.reveal.progress")
            .replace("{n}", formatNumber(current + 1, lang))
            .replace("{total}", formatNumber(items.length, lang))}
        >
          {items.map((entry, position) => (
            <li
              key={entry.player.id}
              aria-hidden
              className={cn(
                "h-1 flex-1",
                ui.radius.full,
                position <= current
                  ? "bg-[color:var(--ui-ink-fg)]"
                  : "bg-[color:var(--ui-surface-sunken)]",
              )}
            />
          ))}
        </ol>
        <div className="mt-3 flex items-center justify-between gap-3">
          <PepitesBack to="/pepites" testId="pepites-reveal-back" />
          <p className={cn("text-end", ui.text.label, ui.tone.muted)}>
            {t("pepites.reveal.stamp").replace("{time}", revealStamp(edition.publishedAt, lang))}
          </p>
        </div>

        {/* Keyed by the player, so each player in the story is a new card that
            turns over: the back (the rank on the club colour), then the front. */}
        <div key={player.id} className="mt-auto flex flex-col items-center pt-6">
          <div className="relative size-56 perspective-midrange">
            <div className="card-flip relative size-full">
              <UiCard
                padding="none"
                className={cn(
                  "absolute inset-0 grid place-items-center overflow-hidden backface-hidden",
                  ui.radius.sheet,
                  ui.shadow.lifted,
                )}
              >
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt=""
                    className="size-full object-cover"
                    data-testid="pepites-reveal-photo"
                  />
                ) : (
                  <PepitesShirt player={player} number={item.rank} className="h-44 w-48" />
                )}
              </UiCard>
              <div
                aria-hidden
                data-club={colours["data-club"]}
                style={colours.style}
                className={cn(
                  "absolute inset-0 grid place-items-center backface-hidden rotate-y-180",
                  ui.radius.sheet,
                  ui.shadow.lifted,
                  ui.club.fill,
                )}
              >
                <bdi className={ui.score.hero}>{formatNumber(item.rank, lang)}</bdi>
              </div>
            </div>
          </div>
          <h1
            className={cn(
              "enter-rise mt-5 text-center text-balance [overflow-wrap:anywhere]",
              ui.display.title,
              ui.tone.default,
            )}
            style={{ animationDelay: "320ms" }}
            data-testid="pepites-reveal-name"
          >
            <bdi>{player.name}</bdi>
          </h1>
          <p className={cn("mt-1 text-center", ui.text.meta, ui.tone.muted)}>{meta}</p>
          <span className="sr-only">
            {t("pepites.hero.rank_line").replace("{n}", formatNumber(item.rank, lang))}
          </span>
        </div>

        <div
          key={`tiles-${player.id}`}
          className="enter-rise mt-4"
          style={{ animationDelay: "400ms" }}
        >
          <UiCard className="grid grid-cols-3 gap-2">
            {tiles.map((tile, position) => (
              <UiStatBlock
                key={tile.label}
                align="center"
                tone={position === 0 ? "ink" : "default"}
                label={tile.label}
                value={<bdi>{tile.value}</bdi>}
              />
            ))}
          </UiCard>
        </div>
        {reason ? (
          <p
            key={`reason-${player.id}`}
            className={cn("enter-rise mt-4 text-center", ui.text.body, ui.tone.default)}
            style={{ animationDelay: "480ms" }}
            data-testid="pepites-reveal-reason"
          >
            «&nbsp;{reason}&nbsp;»
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <UiLinkButton
            to="/pepites/joueur/$playerId"
            params={{ playerId: player.id }}
            variant="gradient"
          >
            {t("pepites.reveal.open_player")}
          </UiLinkButton>
          {next ? (
            // A button, not a link: the story replaces its own step in the
            // history, so Back leaves the story rather than walking it.
            <UiButton
              variant="soft"
              data-testid="pepites-reveal-next"
              onClick={() =>
                void navigate({
                  to: "/pepites/revelation",
                  search: { n: next.rank },
                  replace: true,
                })
              }
            >
              <span>
                {t("pepites.reveal.next")
                  .replace("{n}", formatNumber(next.rank, lang))
                  .replace(TRAILING_ARROW, "")}
              </span>
              <ArrowRight aria-hidden className="h-4 w-4" />
            </UiButton>
          ) : (
            <UiLinkButton to="/pepites" variant="soft" data-testid="pepites-reveal-done">
              {t("pepites.reveal.done")}
            </UiLinkButton>
          )}
        </div>
      </div>
    </main>
  );
}
