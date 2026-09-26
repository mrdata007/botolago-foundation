import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { PlayerMatch, PlayerResponse } from "@/backend/pepites/contracts";
import { PlayerPhoto } from "@/components/common/PlayerPhoto";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  ui,
  UiBackButton,
  UiEmptyState,
  UiErrorState,
  UiKeyValueRow,
  UiStatePanel,
  UiTabs,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import {
  formatNumber,
  playerPhotoUrl,
  positionLabel,
  shortDate,
  teamAsClub,
} from "./pepites-format";
import { PepitesCard, PepitesComingSoon, PepitesPreviewBanner } from "./PepitesParts";
import { PepitesShell } from "./PepitesShell";
import { ReportIssueButton } from "./ReportIssueSheet";
import {
  playerMatchesQueryOptions,
  playerQueryOptions,
  pointerVersion,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";

export type PlayerTab = "overview" | "matches";

type LoadedPlayer = Extract<PlayerResponse, { available: true }>;

const COMPONENTS = ["rating", "form", "contribution", "progression", "minutes"] as const;
type ComponentKey = (typeof COMPONENTS)[number];

function componentLabel(key: ComponentKey, t: (key: TranslationKey) => string): string {
  switch (key) {
    case "rating":
      return t("pepites.component.rating");
    case "form":
      return t("pepites.component.form");
    case "contribution":
      return t("pepites.component.contribution");
    case "progression":
      return t("pepites.component.progression");
    case "minutes":
      return t("pepites.component.minutes");
  }
}

/** Why a player has no score, from the engine's flags (architecture §4.2). */
function unrankedReason(flags: readonly string[], t: (key: TranslationKey) => string): string {
  if (flags.includes("below_minutes_floor")) return t("pepites.player.unranked_minutes");
  if (flags.includes("insufficient_data")) return t("pepites.player.unranked_data");
  return t("pepites.player.unranked_other");
}

/** The provider's detailed position, as a word; an unknown code stays as it is. */
function detailedPositionLabel(code: string, t: (key: TranslationKey) => string): string {
  switch (code) {
    case "gk":
      return t("pepites.detailed.gk");
    case "cb":
      return t("pepites.detailed.cb");
    case "lb":
      return t("pepites.detailed.lb");
    case "rb":
      return t("pepites.detailed.rb");
    case "dm":
      return t("pepites.detailed.dm");
    case "cm":
      return t("pepites.detailed.cm");
    case "am":
      return t("pepites.detailed.am");
    case "lw":
      return t("pepites.detailed.lw");
    case "rw":
      return t("pepites.detailed.rw");
    case "cf":
      return t("pepites.detailed.cf");
    default:
      return code;
  }
}

function footLabel(foot: string | null, t: (key: TranslationKey) => string): string | null {
  switch (foot) {
    case "left":
      return t("pepites.player.foot_left");
    case "right":
      return t("pepites.player.foot_right");
    case "both":
      return t("pepites.player.foot_both");
    default:
      return null;
  }
}

/**
 * `/pepites/joueur/$playerId`: who the player is, where he stands in the
 * current version, what makes up his score, and his last matches. Missing
 * attributes say so ("Non renseigné") and can be reported.
 */
export function PepitesPlayerPage({
  playerId,
  tab,
  onTabChange,
}: {
  playerId: string;
  tab: PlayerTab;
  onTabChange: (tab: PlayerTab) => void;
}) {
  const { t } = useI18n();
  const viewer = usePepitesViewer();
  const pointerQuery = useVersionPointer(viewer);
  const pointer = pointerQuery.data;
  const version = pointerVersion(pointer);
  const player = useQuery({
    ...playerQueryOptions(viewer, version, playerId),
    enabled: pointer?.available === true && version !== null,
    placeholderData: (previous) => previous,
  });
  const matches = useQuery({
    ...playerMatchesQueryOptions(viewer, playerId),
    enabled: pointer?.available === true && tab === "matches",
  });

  const back = <UiBackButton to="/pepites/classement" />;

  if (pointerQuery.isPending || (player.isPending && pointer?.available && version !== null)) {
    return (
      <PepitesShell view={null}>
        {back}
        <UiStatePanel kind="loading" />
      </PepitesShell>
    );
  }
  if (!pointer?.available) {
    return (
      <PepitesShell view={null}>
        {pointerQuery.isError ? (
          <UiErrorState
            title={t("pepites.state.error")}
            onRetry={() => void pointerQuery.refetch()}
          />
        ) : (
          <PepitesComingSoon />
        )}
      </PepitesShell>
    );
  }
  const data = player.data;
  if (player.isError && !data) {
    return (
      <PepitesShell view={null}>
        {back}
        <UiErrorState title={t("pepites.state.error")} onRetry={() => void player.refetch()} />
      </PepitesShell>
    );
  }
  if (!data?.available || !data.found || !data.player) {
    return (
      <PepitesShell view={null}>
        {back}
        <UiEmptyState testId="pepites-player-missing" title={t("pepites.player.not_found")} />
      </PepitesShell>
    );
  }

  return (
    <PepitesShell view={null}>
      {back}
      {data.preview ? <PepitesPreviewBanner /> : null}
      <PlayerHeader data={data} />
      <UiTabs<PlayerTab>
        value={tab}
        onChange={onTabChange}
        label={t("pepites.player.tabs")}
        idBase="pepites-player-tab"
        options={[
          { value: "overview", label: t("pepites.player.tab_overview") },
          { value: "matches", label: t("pepites.player.tab_matches") },
        ]}
      />
      {tab === "matches" ? (
        <PlayerMatches
          loading={matches.isPending}
          failed={matches.isError}
          onRetry={() => void matches.refetch()}
          matches={
            matches.data?.available && matches.data.found ? (matches.data.matches ?? []) : []
          }
        />
      ) : (
        <PlayerOverview data={data} />
      )}
      <ReportIssueButton playerId={playerId} />
    </PepitesShell>
  );
}

function PlayerHeader({ data }: { data: LoadedPlayer }) {
  const { t, tr, lang } = useI18n();
  const player = data.player!;
  const photoUrl = playerPhotoUrl(player);
  const missing = new Set(player.missing);
  const notSet = t("pepites.player.not_set");
  const foot = footLabel(player.preferredFoot, t);
  return (
    <PepitesCard testId="pepites-player-header">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <PlayerPhoto
            photoUrl={photoUrl}
            club={teamAsClub(player.team)}
            size="xl"
            loading="eager"
          />
          <div className="min-w-0 flex-1">
            <h2
              className={cn(ui.text.title, "[overflow-wrap:anywhere]")}
              data-testid="pepites-player-name"
            >
              <bdi>{player.name}</bdi>
            </h2>
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {[
                player.team ? tr(player.team.name) : null,
                player.positionGroup ? positionLabel(player.positionGroup, t) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {photoUrl && (player.photo?.credit || player.photo?.copyrightOwner) ? (
              <p className={cn(ui.text.micro, ui.tone.faint)} data-testid="pepites-photo-credit">
                {t("pepites.player.photo_credit").replace(
                  "{credit}",
                  player.photo.credit ?? player.photo.copyrightOwner ?? "",
                )}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col">
          <UiKeyValueRow
            label={t("pepites.player.age")}
            value={
              typeof player.age === "number" ? (
                <bdi>{`${formatNumber(player.age, lang)} ${t("pepites.age_suffix")}`}</bdi>
              ) : (
                notSet
              )
            }
          />
          <UiKeyValueRow
            label={t("pepites.player.nationality")}
            value={player.nationality && !missing.has("nationality") ? player.nationality : notSet}
          />
          <UiKeyValueRow
            label={t("pepites.player.position")}
            value={
              player.detailedPosition && !missing.has("detailed_position")
                ? detailedPositionLabel(player.detailedPosition, t)
                : notSet
            }
          />
          <UiKeyValueRow
            label={t("pepites.player.foot")}
            value={foot && !missing.has("preferred_foot") ? foot : notSet}
          />
          <UiKeyValueRow
            label={t("pepites.player.height")}
            value={
              player.heightCm && !missing.has("height_cm") ? (
                <bdi>{`${formatNumber(player.heightCm, lang)} cm`}</bdi>
              ) : (
                notSet
              )
            }
          />
        </div>
      </div>
    </PepitesCard>
  );
}

function PlayerOverview({ data }: { data: LoadedPlayer }) {
  const { t, lang } = useI18n();
  const score = data.score ?? null;
  const player = data.player!;
  return (
    <>
      <PepitesCard testId="pepites-player-score">
        {score && score.score !== null ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className={cn(ui.text.label, ui.tone.muted)}>{t("pepites.player.score")}</p>
                <span
                  className="inline-flex items-baseline gap-1"
                  data-testid="pepites-player-score-value"
                >
                  <bdi className={ui.score.lg}>{formatNumber(Math.round(score.score), lang)}</bdi>
                  <span className={cn(ui.text.micro, ui.tone.muted)}>/100</span>
                </span>
              </div>
              <div className="text-end">
                {score.rank !== null ? (
                  <p className={ui.text.bodyStrong} data-testid="pepites-player-rank">
                    {t("pepites.player.rank").replace("{n}", formatNumber(score.rank, lang))}
                  </p>
                ) : null}
                {score.rankInPosition !== null && player.positionGroup ? (
                  <p className={cn(ui.text.meta, ui.tone.muted)}>
                    {t("pepites.player.rank_in_position")
                      .replace("{n}", formatNumber(score.rankInPosition, lang))
                      .replace("{position}", positionLabel(player.positionGroup, t))}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-2" data-testid="pepites-player-components">
              <p className={cn(ui.text.label, ui.tone.muted)}>{t("pepites.player.components")}</p>
              {COMPONENTS.map((key) => {
                const value = score.percentiles[key];
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={ui.text.meta}>{componentLabel(key, t)}</span>
                      <bdi className={cn(ui.text.meta, ui.tone.muted, "tabular-nums")}>
                        {typeof value === "number" ? formatNumber(Math.round(value), lang) : "–"}
                      </bdi>
                    </div>
                    <div
                      className={cn("h-2 overflow-hidden", ui.radius.full, ui.surface.sunken)}
                      role="presentation"
                    >
                      <div
                        className={cn("h-full", ui.radius.full)}
                        style={{
                          width: `${typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0}%`,
                          backgroundColor: "var(--ui-positive)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className={cn(ui.text.micro, ui.tone.muted)}>
                {t("pepites.player.components_hint")}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1" data-testid="pepites-player-unranked">
            <p className={ui.text.bodyStrong}>{t("pepites.player.unranked_title")}</p>
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {score ? unrankedReason(score.flags, t) : t("pepites.player.unranked_other")}
            </p>
          </div>
        )}
      </PepitesCard>

      {score ? (
        <PepitesCard testId="pepites-player-season">
          <p className={cn(ui.text.label, ui.tone.muted, "mb-2")}>{t("pepites.player.season")}</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t("pepites.player.apps"), value: score.apps },
              { label: t("pepites.player.minutes"), value: score.minutes },
              { label: t("pepites.player.goals"), value: score.goals },
              { label: t("pepites.player.assists"), value: score.assists },
              ...(score.cleanSheets !== null
                ? [{ label: t("pepites.player.clean_sheets"), value: score.cleanSheets }]
                : []),
              ...(score.saves !== null
                ? [{ label: t("pepites.player.saves"), value: score.saves }]
                : []),
            ].map((item) => (
              <div key={item.label} className="flex flex-col">
                <bdi className={cn(ui.score.row, "tabular-nums")}>
                  {formatNumber(item.value, lang)}
                </bdi>
                <span className={cn(ui.text.micro, ui.tone.muted)}>{item.label}</span>
              </div>
            ))}
            <div className="flex flex-col">
              <bdi className={cn(ui.score.row, "tabular-nums")}>
                {score.ratingAvg === null ? "–" : formatNumber(score.ratingAvg, lang, 2)}
              </bdi>
              <span className={cn(ui.text.micro, ui.tone.muted)}>{t("pepites.player.rating")}</span>
            </div>
          </div>
        </PepitesCard>
      ) : null}

      {data.editions && data.editions.length > 0 ? (
        <PepitesCard testId="pepites-player-editions">
          <p className={cn(ui.text.label, ui.tone.muted, "mb-2")}>{t("pepites.player.editions")}</p>
          <ul className="flex flex-col">
            {data.editions.map((entry) => (
              <li key={entry.editionId}>
                <Link
                  to="/pepites/semaine/$n"
                  params={{ n: String(entry.week) }}
                  className={cn(
                    "flex items-center justify-between gap-2 py-2",
                    ui.text.meta,
                    ui.focus,
                  )}
                >
                  <span>
                    {t("pepites.player.edition_week").replace(
                      "{n}",
                      formatNumber(entry.week, lang),
                    )}
                  </span>
                  <bdi className={ui.text.bodyStrong}>#{formatNumber(entry.rank, lang)}</bdi>
                </Link>
              </li>
            ))}
          </ul>
        </PepitesCard>
      ) : null}
    </>
  );
}

function PlayerMatches({
  matches,
  loading,
  failed,
  onRetry,
}: {
  matches: readonly PlayerMatch[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t, tr, lang } = useI18n();
  if (loading) return <UiStatePanel kind="loading" />;
  if (failed) return <UiErrorState title={t("pepites.state.error")} onRetry={onRetry} />;
  if (matches.length === 0) return <UiEmptyState title={t("pepites.player.no_matches")} />;
  return (
    <ul className="flex flex-col gap-2" data-testid="pepites-player-matches">
      {matches.map((match) => {
        const score =
          match.teamScore !== null && match.opponentScore !== null
            ? `${match.teamScore}-${match.opponentScore}`
            : "–";
        return (
          <li key={match.fixtureId} className={cn("flex items-center gap-3 p-3", ui.surface.card)}>
            <div className="min-w-0 flex-1">
              <p className={cn(ui.text.bodyStrong, "truncate")}>
                {match.home ? t("pepites.match.vs") : t("pepites.match.at")}{" "}
                {match.opponent ? tr(match.opponent.shortName) : "–"}{" "}
                <bdi className={ui.tone.muted}>{score}</bdi>
              </p>
              <p className={cn(ui.text.meta, ui.tone.muted)}>
                {shortDate(match.kickoffAt, lang)} ·{" "}
                <bdi>{`${formatNumber(match.minutes, lang)}′`}</bdi>
                {match.started ? ` · ${t("pepites.match.started")}` : ""}
                {match.goals > 0
                  ? ` · ${t("pepites.match.goals").replace("{n}", formatNumber(match.goals, lang))}`
                  : ""}
                {match.assists > 0
                  ? ` · ${t("pepites.match.assists").replace("{n}", formatNumber(match.assists, lang))}`
                  : ""}
              </p>
            </div>
            <bdi className={cn(ui.score.row, "tabular-nums")}>
              {match.rating === null ? "–" : formatNumber(match.rating, lang, 1)}
            </bdi>
          </li>
        );
      })}
    </ul>
  );
}
