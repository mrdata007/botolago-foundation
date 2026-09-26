import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Clock, Eye, Hourglass, Minus, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type { Movement, PepitesPlayerCard, VersionResponse } from "@/backend/pepites/contracts";
import { PlayerPhoto } from "@/components/common/PlayerPhoto";
import { ui, UiBadge, UiCard, UiEmptyState, UiTabs } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import {
  formatNumber,
  playerPhotoUrl,
  positionLabel,
  revealTime,
  scoreText,
  teamAsClub,
} from "./pepites-format";
import { secondsUntil } from "./reveal";

export type PepitesView = "top" | "ranking" | "method";

/** The three halves of Pépites, as route tabs (like the Matches tabs). */
export function PepitesTabs({ active }: { active: PepitesView }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <UiTabs<PepitesView>
      value={active}
      onChange={(next) =>
        void navigate({
          to:
            next === "ranking"
              ? "/pepites/classement"
              : next === "method"
                ? "/pepites/methode"
                : "/pepites",
        })
      }
      label={t("pepites.a11y.views")}
      idBase="pepites-view"
      options={[
        { value: "top", label: t("pepites.tab.top") },
        { value: "ranking", label: t("pepites.tab.ranking") },
        { value: "method", label: t("pepites.tab.method") },
      ]}
    />
  );
}

/** Pépites is not open to this reader (mode off, or staff-only). */
export function PepitesComingSoon() {
  const { t } = useI18n();
  return (
    <UiEmptyState
      testId="pepites-coming-soon"
      title={t("pepites.state.coming_soon")}
      body={t("pepites.state.coming_soon_body")}
    />
  );
}

/** Staff mode: what staff see is not public yet. */
export function PepitesPreviewBanner() {
  const { t } = useI18n();
  return (
    <div
      role="status"
      data-testid="pepites-preview"
      className={cn(
        "mb-3 flex items-center gap-2 rounded-[var(--ui-radius-card)] px-3 py-2",
        ui.surface.sunken,
        ui.text.meta,
      )}
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <span>{t("pepites.preview_banner")}</span>
    </div>
  );
}

/**
 * The reveal band (architecture §7): a countdown while an edition is
 * scheduled, "coming" once it is late. The page underneath keeps showing the
 * current version until the new one is published.
 */
export function PepitesRevealBanner({ pointer }: { pointer: VersionResponse | undefined }) {
  const { t, lang } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const counting = pointer?.available === true && pointer.state === "countdown";
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [counting]);
  if (!pointer?.available || pointer.state === "current") return null;
  if (pointer.state === "delayed") {
    return (
      <div role="status" data-testid="pepites-reveal-delayed" className={bandClass}>
        <Hourglass className="h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className={ui.text.bodyStrong}>{t("pepites.reveal.delayed_title")}</p>
          <p className={cn(ui.text.meta, ui.tone.onInkMuted)}>{t("pepites.reveal.delayed_body")}</p>
        </div>
      </div>
    );
  }
  const left = secondsUntil(pointer.nextRevealAt, now);
  const hours = left === null ? 0 : Math.floor(left / 3600);
  const minutes = left === null ? 0 : Math.floor((left % 3600) / 60);
  const seconds = left === null ? 0 : left % 60;
  const clock =
    hours > 0
      ? `${formatNumber(hours, lang)}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${formatNumber(minutes, lang)}:${String(seconds).padStart(2, "0")}`;
  return (
    <div role="timer" data-testid="pepites-reveal-countdown" className={bandClass}>
      <Clock className="h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={ui.text.bodyStrong}>{t("pepites.reveal.countdown_title")}</p>
        {pointer.nextRevealAt ? (
          <p className={cn(ui.text.meta, ui.tone.onInkMuted)}>
            {revealTime(pointer.nextRevealAt, lang)}
          </p>
        ) : null}
      </div>
      {left !== null ? (
        <bdi className={cn(ui.score.sm, "tabular-nums")} aria-live="off">
          {clock}
        </bdi>
      ) : null}
    </div>
  );
}

const bandClass = cn(
  "mb-4 flex items-center gap-3 rounded-[var(--ui-radius-card)] px-4 py-3",
  ui.surface.inkPlain,
);

/** The arrow a reader saw last week: up, down, same, new (§4.5). */
export function MovementBadge({ movement }: { movement: Movement }) {
  const { t, lang } = useI18n();
  if (!movement) return null;
  if (movement.kind === "new") {
    return (
      <UiBadge tone="action">
        <Sparkles className="h-3 w-3" aria-hidden />
        {t("pepites.movement.new")}
      </UiBadge>
    );
  }
  const Icon = movement.kind === "up" ? ArrowUp : movement.kind === "down" ? ArrowDown : Minus;
  const label =
    movement.kind === "up"
      ? t("pepites.movement.up")
      : movement.kind === "down"
        ? t("pepites.movement.down")
        : t("pepites.movement.same");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        ui.text.meta,
        movement.kind === "up"
          ? ui.tone.positive
          : movement.kind === "down"
            ? ui.tone.negative
            : ui.tone.muted,
      )}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
      {movement.kind !== "same" ? <bdi>{formatNumber(movement.by ?? 1, lang)}</bdi> : null}
    </span>
  );
}

/** A player line: photo or silhouette, name, club, age and position. */
export function PepitesPlayerLine({
  player,
  trailing,
  size = "md",
}: {
  player: PepitesPlayerCard;
  trailing?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const { t, tr, lang } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PlayerPhoto photoUrl={playerPhotoUrl(player)} club={teamAsClub(player.team)} size={size} />
      <div className="min-w-0 flex-1">
        <p className={cn(ui.text.bodyStrong, "truncate")}>
          {/* A Latin name in an Arabic line keeps its own order ("Achraf V."). */}
          <bdi>{player.name}</bdi>
        </p>
        <p className={cn(ui.text.meta, ui.tone.muted, "truncate")}>
          {[
            player.team ? tr(player.team.name) : null,
            player.positionGroup ? positionLabel(player.positionGroup, t) : null,
            typeof player.age === "number"
              ? `${formatNumber(player.age, lang)} ${t("pepites.age_suffix")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {trailing}
    </div>
  );
}

/** The score out of 100, or "N.C." for a player not ranked. */
export function ScoreFigure({ score, className }: { score: number | null; className?: string }) {
  const { t, lang } = useI18n();
  return (
    // "90 /100" reads left to right in both languages.
    <span dir="ltr" className={cn("inline-flex items-baseline gap-1", className)}>
      <bdi className={ui.score.row}>{scoreText(score, lang, t("pepites.unranked"))}</bdi>
      {typeof score === "number" ? (
        <span className={cn(ui.text.micro, ui.tone.muted)}>/100</span>
      ) : null}
    </span>
  );
}

/** A card linking to a player page. */
export function PlayerLink({ playerId, children }: { playerId: string; children: ReactNode }) {
  return (
    <Link
      to="/pepites/joueur/$playerId"
      params={{ playerId }}
      className={cn("block rounded-[var(--ui-radius-card)]", ui.focus)}
    >
      {children}
    </Link>
  );
}

/** "Mis à jour" line: trust (plan §4). */
export function UpdatedLine({ iso }: { iso: string | null | undefined }) {
  const { t, lang } = useI18n();
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const text = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Casablanca",
  }).format(date);
  return (
    <p className={cn(ui.text.meta, ui.tone.muted)}>
      {t("pepites.updated")} <bdi>{text}</bdi>
    </p>
  );
}

export function PepitesCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <UiCard padding="md" testId={testId}>
      {children}
    </UiCard>
  );
}
