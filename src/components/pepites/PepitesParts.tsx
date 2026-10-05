import { Link } from "@tanstack/react-router";
import { Clock, Eye, Hourglass } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type { PreviousSeason, VersionResponse } from "@/backend/pepites/contracts";
import {
  ui,
  UiAlert,
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiSkeleton,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";

import { formatNumber, nextSeasonLabel, revealTime, scoreText } from "./pepites-format";
import { PepitesPageTitle, PepitesShell } from "./PepitesShell";
import { secondsUntil } from "./reveal";

/**
 * The states and banners every Pépites page goes through, on the main kit
 * (BG-0152): cards are `UiCard`, the non-ready states `UiEmptyState` /
 * `UiErrorState` / `UiSkeleton`, the banners `UiAlert`. No night band.
 */

/**
 * A Pépites card: the kit's `UiCard` (white, 14px, the card shadow, 16px
 * padding). New code can use `UiCard` directly; this keeps the call sites.
 */
export function PepitesCard({
  children,
  testId,
  className,
}: {
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <UiCard testId={testId} className={className}>
      {children}
    </UiCard>
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

/** How long the skeletons stay before the page says it failed. */
export const LOADING_GIVE_UP_MS = 12_000;

/**
 * Loading: a title band and skeleton rows the shape of a Top 10, for twelve
 * seconds at most; then the error state with "Réessayer".
 */
export function PepitesLoadingState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (late) return;
    const timer = setTimeout(() => setLate(true), LOADING_GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [late]);
  if (late) {
    return (
      <PepitesErrorState
        onRetry={() => {
          setLate(false);
          onRetry();
        }}
      />
    );
  }
  return (
    <PepitesShell
      pageHeader={
        // The title band's own frame (`UiPageTitle`: the bar, its rule, the
        // 44px title row), so the page does not jump when the title lands.
        <div aria-hidden className={cn(ui.surface.bar, ui.rule.block, "pb-3 pt-2")}>
          <div className={cn(ui.space.content, ui.space.gutter)}>
            <div className="flex min-h-[var(--ui-tap-min)] items-center">
              <UiSkeleton className="h-8 w-48" />
            </div>
          </div>
        </div>
      }
    >
      <div
        className="flex flex-col gap-2.5"
        role="status"
        aria-busy="true"
        data-testid="pepites-loading"
      >
        <span className="sr-only">{t("state.loading")}</span>
        {Array.from({ length: 7 }, (_, index) => (
          <UiSkeleton key={index} className={cn("h-14", ui.radius.card)} />
        ))}
      </div>
    </PepitesShell>
  );
}

/** Error: what failed and a way to try again. Inline inside a page, or a page. */
export function PepitesErrorState({
  onRetry,
  inline = false,
}: {
  onRetry: () => void;
  inline?: boolean;
}) {
  const { t } = useI18n();
  const card = (
    <UiErrorState
      testId="pepites-error"
      title={t("pepites.state.error")}
      body={t("pepites.state.error_body")}
      action={
        <UiButton variant="ink" className="mt-4" onClick={onRetry}>
          {t("pepites.state.retry")}
        </UiButton>
      }
    />
  );
  return inline ? card : <PepitesShell>{card}</PepitesShell>;
}

/**
 * Before the first edition: last season's final ranking under its own
 * title (never shown as this week's), and when the first Top 10 comes.
 */
export function PepitesBeforeFirstEdition({
  previous,
  firstRound,
  pointer,
  footer,
}: {
  previous: PreviousSeason;
  firstRound: number;
  pointer: Extract<VersionResponse, { available: true }>;
  footer: ReactNode;
}) {
  const { t, lang } = useI18n();
  return (
    <PepitesShell
      pageHeader={
        <PepitesPageTitle
          title={
            // The list below is labelled by this heading.
            <span id="pepites-previous-title" data-testid="pepites-previous-title">
              {t("pepites.home.previous_title").replace("{season}", previous.seasonLabel)}
            </span>
          }
        >
          <p className={cn(ui.text.meta, ui.tone.muted)}>
            {t("pepites.state.season_started").replace(
              "{season}",
              nextSeasonLabel(previous.seasonLabel),
            )}
          </p>
        </PepitesPageTitle>
      }
    >
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      <PepitesRevealBanner pointer={pointer} />
      <UiCard testId="pepites-before-first" className="flex flex-col gap-1">
        <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
          {t("pepites.state.first_title").replace("{round}", formatNumber(firstRound, lang))}
        </p>
        <p className={cn(ui.text.secondary, ui.tone.muted)}>
          {t("pepites.state.first_body")
            .replace("{round}", formatNumber(firstRound, lang))
            .replace("{season}", previous.seasonLabel)}
        </p>
      </UiCard>
      <ol
        className="flex flex-col gap-2.5"
        data-testid="pepites-top10"
        aria-labelledby="pepites-previous-title"
      >
        {previous.entries.slice(0, 10).map((entry) => (
          <li key={entry.player.id}>
            <Link
              to="/pepites/joueur/$playerId"
              params={{ playerId: entry.player.id }}
              data-testid="pepites-top-entry"
              className={cn(
                // An interactive `UiCard` as a link: the card surface, the
                // 48px row floor, the tile press and the focus ring.
                ui.surface.card,
                "press-tile flex min-h-[var(--ui-row-min)] items-center gap-3 px-4 py-2",
                ui.focus,
              )}
            >
              <span className={cn("w-6 shrink-0 text-center", ui.score.row, ui.tone.ink)}>
                <bdi>{formatNumber(entry.rank, lang)}</bdi>
              </span>
              <span className={cn("min-w-0 flex-1 truncate", ui.text.bodyStrong, ui.tone.default)}>
                <bdi>{entry.player.name}</bdi>
              </span>
              {/* `ui.stat`: the score may be the "unranked" word, which the
                  digits-only score ramp must not carry. */}
              <span className={cn("shrink-0", ui.stat.md, ui.tone.ink)}>
                <bdi>{scoreText(entry.score, lang, t("pepites.unranked"))}</bdi>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {footer}
    </PepitesShell>
  );
}

/** Staff mode: what staff see is not public yet. */
export function PepitesPreviewBanner() {
  const { t } = useI18n();
  return (
    <UiAlert tone="info" testId="pepites-preview" icon={<Eye className="h-5 w-5" />}>
      {t("pepites.preview_banner")}
    </UiAlert>
  );
}

/**
 * The reveal banner (architecture §7): a countdown while an edition is
 * scheduled, "coming" once it is late. The page underneath keeps showing
 * the current version until the new one is published. The clock is a
 * standalone figure (`ui.score.sm`) at the inline end, inside a
 * `role="timer"` box that does not announce every second.
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
      <UiAlert
        tone="info"
        testId="pepites-reveal-delayed"
        icon={<Hourglass className="h-5 w-5" />}
        title={t("pepites.reveal.delayed_title")}
      >
        {t("pepites.reveal.delayed_body")}
      </UiAlert>
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
    <div role="timer" data-testid="pepites-reveal-countdown">
      <UiAlert
        tone="info"
        live={false}
        icon={<Clock className="h-5 w-5" />}
        title={t("pepites.reveal.countdown_title")}
        action={
          left !== null ? (
            <bdi className={cn(ui.score.sm, ui.text.tabular, ui.tone.ink)} aria-live="off">
              {clock}
            </bdi>
          ) : null
        }
      >
        {pointer.nextRevealAt ? revealTime(pointer.nextRevealAt, lang) : null}
      </UiAlert>
    </div>
  );
}

/** "Publié le" line: trust (plan §4). */
export function UpdatedLine({ iso }: { iso: string | null | undefined }) {
  const { t, lang } = useI18n();
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const text = moroccoDateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return (
    <p className={cn(ui.text.meta, ui.tone.muted)}>
      {t("pepites.updated")} <bdi>{text}</bdi>
    </p>
  );
}
