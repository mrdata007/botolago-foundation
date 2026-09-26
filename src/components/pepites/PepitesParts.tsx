import { Link } from "@tanstack/react-router";
import { Clock, Eye, Hourglass } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type { PreviousSeason, VersionResponse } from "@/backend/pepites/contracts";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { pp } from "./pepites-design";
import { formatNumber, nextSeasonLabel, revealTime, scoreText } from "./pepites-format";
import { PepitesShell } from "./PepitesShell";
import { MonoLine, NightBand } from "./PepitesVisuals";
import { secondsUntil } from "./reveal";

/** A white Pépites card (Figma: radius 14, the soft navy shadow). */
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
    <div data-testid={testId} className={cn("rounded-[14px] p-4", pp.card, className)}>
      {children}
    </div>
  );
}

/** A title, a line and an action, centred on a card (Figma S3). */
function StateCard({
  title,
  body,
  testId,
  action,
}: {
  title: string;
  body?: string;
  testId?: string;
  action?: ReactNode;
}) {
  return (
    <PepitesCard
      testId={testId}
      className="mt-10 flex flex-col items-center gap-2 px-6 py-8 text-center"
    >
      <p className={cn(pp.heavy, pp.ink, "text-[17px] leading-tight")}>{title}</p>
      {body ? (
        <p className={cn(pp.muted, "max-w-[34ch] text-[13px] leading-[1.45]")}>{body}</p>
      ) : null}
      {action}
    </PepitesCard>
  );
}

/** The short band a page without a hero of its own opens on (Figma S1–S3). */
function ShortBand({ children }: { children?: ReactNode }) {
  return (
    <NightBand cut={26}>
      <div className="flex min-h-[120px] flex-col justify-end gap-2 pb-12 pt-3">{children}</div>
    </NightBand>
  );
}

/** Pépites is not open to this reader (mode off, or staff-only). */
export function PepitesComingSoon() {
  const { t } = useI18n();
  return (
    <StateCard
      testId="pepites-coming-soon"
      title={t("pepites.state.coming_soon")}
      body={t("pepites.state.coming_soon_body")}
    />
  );
}

/** How long the skeletons stay before the page says it failed (Figma S1). */
export const LOADING_GIVE_UP_MS = 12_000;

/**
 * S1 · loading: the short band and skeleton rows, for twelve seconds at most;
 * then S3 with "Réessayer".
 */
export function PepitesLoadingState({ onRetry }: { onRetry: () => void }) {
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
  const bone = "bg-[color:var(--pepites-seg-empty)]";
  return (
    <PepitesShell
      hero={
        <ShortBand>
          <span aria-hidden className="h-3 w-40 rounded-full bg-white/15" />
          <span aria-hidden className="h-[60px] w-[90px] rounded-[8px] bg-white/15" />
        </ShortBand>
      }
    >
      <div
        className="flex flex-col gap-3"
        role="status"
        aria-busy="true"
        data-testid="pepites-loading"
      >
        <span className="sr-only">…</span>
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            aria-hidden
            className={cn("flex h-[56px] items-center gap-3 rounded-[14px] px-3", pp.card)}
          >
            <span className={cn("h-4 w-5 rounded-full", bone)} />
            <span className={cn("size-9 rounded-[8px]", bone)} />
            <span className="flex flex-1 flex-col gap-2">
              <span className={cn("h-2.5 w-3/5 rounded-full", bone)} />
              <span className={cn("h-1.5 w-full rounded-full", bone)} />
            </span>
            <span className={cn("h-4 w-8 rounded-full", bone)} />
          </div>
        ))}
      </div>
    </PepitesShell>
  );
}

/** S3 · error: what failed and a way to try again. Inline inside a page, or a page. */
export function PepitesErrorState({
  onRetry,
  inline = false,
}: {
  onRetry: () => void;
  inline?: boolean;
}) {
  const { t } = useI18n();
  const card = (
    <StateCard
      testId="pepites-error"
      title={t("pepites.state.error")}
      body={t("pepites.state.error_body")}
      action={
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "mt-3 inline-flex min-h-[var(--ui-tap-min)] items-center rounded-full px-7 text-[13px] text-white",
            "bg-[color:var(--pepites-ink)] dark:bg-[color:var(--ui-ink)]",
            pp.heavy,
            ui.focus,
          )}
        >
          {t("pepites.state.retry")}
        </button>
      }
    />
  );
  return inline ? card : <PepitesShell hero={<ShortBand />}>{card}</PepitesShell>;
}

/**
 * S2 · before the first edition: last season's final ranking under its own
 * label (never shown as this week's), and when the first Top 10 comes.
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
      hero={
        <ShortBand>
          <h2
            id="pepites-previous-title"
            data-testid="pepites-previous-title"
            className={cn(pp.display, pp.lean, "text-[28px] leading-[1.1] text-white")}
          >
            {t("pepites.home.previous_title").replace("{season}", previous.seasonLabel)}
          </h2>
          <MonoLine tone="spring">
            {t("pepites.state.season_started").replace(
              "{season}",
              nextSeasonLabel(previous.seasonLabel),
            )}
          </MonoLine>
        </ShortBand>
      }
    >
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      <PepitesRevealBanner pointer={pointer} />
      <PepitesCard testId="pepites-before-first" className="flex flex-col gap-1.5 p-[18px]">
        <p className={cn(pp.heavy, pp.text, "text-[15px] leading-[1.3]")}>
          {t("pepites.state.first_title").replace("{round}", formatNumber(firstRound, lang))}
        </p>
        <p className={cn(pp.muted, "text-[12px] leading-[1.45]")}>
          {t("pepites.state.first_body")
            .replace("{round}", formatNumber(firstRound, lang))
            .replace("{season}", previous.seasonLabel)}
        </p>
      </PepitesCard>
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
                "flex min-h-[52px] items-center gap-4 rounded-[14px] px-4",
                pp.card,
                ui.focus,
              )}
            >
              <bdi className={cn(pp.display, pp.ink, "w-5 text-[17px]")}>
                {formatNumber(entry.rank, lang)}
              </bdi>
              <span className={cn(pp.heavy, pp.text, "min-w-0 flex-1 truncate text-[13px]")}>
                <bdi>{entry.player.name}</bdi>
              </span>
              <bdi className={cn(pp.display, pp.ink, "text-[17px]")}>
                {scoreText(entry.score, lang, t("pepites.unranked"))}
              </bdi>
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
    <div
      role="status"
      data-testid="pepites-preview"
      className={cn(
        "flex items-center gap-2 rounded-[12px] border px-3 py-2 text-[12px]",
        pp.line,
        pp.muted,
        "bg-[color:var(--pepites-card)]",
      )}
    >
      <Eye className="size-4 shrink-0" aria-hidden />
      <span>{t("pepites.preview_banner")}</span>
    </div>
  );
}

/**
 * The reveal band (architecture §7, Figma 06): a countdown while an edition
 * is scheduled, "coming" once it is late. The page underneath keeps showing
 * the current version until the new one is published.
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
        <Hourglass className="size-5 shrink-0 text-[color:var(--pepites-spring)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={cn(pp.heavy, "text-[14px]")}>{t("pepites.reveal.delayed_title")}</p>
          <p className="text-[12px] text-[color:var(--pepites-on-night-sub)]">
            {t("pepites.reveal.delayed_body")}
          </p>
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
      <Clock className="size-5 shrink-0 text-[color:var(--pepites-spring)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn(pp.heavy, "text-[14px]")}>{t("pepites.reveal.countdown_title")}</p>
        {pointer.nextRevealAt ? (
          <MonoLine tone="sub">{revealTime(pointer.nextRevealAt, lang)}</MonoLine>
        ) : null}
      </div>
      {left !== null ? (
        <bdi className={cn(pp.display, pp.energyText, "text-[24px] tabular-nums")} aria-live="off">
          {clock}
        </bdi>
      ) : null}
    </div>
  );
}

const bandClass = cn("flex items-center gap-3 rounded-[14px] px-4 py-3", pp.night);

/** "Publié le" line: trust (plan §4). */
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
    <p className={cn("text-[12px]", pp.muted)}>
      {t("pepites.updated")} <bdi>{text}</bdi>
    </p>
  );
}
