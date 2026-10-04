import { useI18n } from "@/i18n/provider";
import { AlertTriangle, CircleSlash, Inbox, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ui, UiButton, UiSkeleton } from "@/components/ui-kit";

/**
 * Loading / empty / error / offline states, in the Option A register.
 *
 * Calm and quiet — the states are not decoration — but in the same shape
 * language as everything around them: the 14px card radius, filled panels
 * rather than dashed outlines, and the glyph in a ROUND disc like the icon
 * discs on the boards' shortcut tiles and profile rows. The retry is the
 * kit's round ink button.
 *
 * The empty panel stays a SUNKEN fill rather than a white card: it is placed
 * both on the page and inside cards (the Home fixtures card), and a white
 * card nested in a white card has no edge.
 *
 * Three situations, three looks, so a reader can tell them apart:
 *
 *   `EmptyState`       there is nothing to show YET OR NOW, and that is normal
 *                      — no match scheduled that day, a match not started.
 *                      An `action` can lead on to what does exist.
 *   `UnavailableState` the information is not available and may never be — a
 *                      finished match with no statistics. A crossed-out
 *                      glyph, no retry: asking again will not produce it.
 *   `ErrorState`       the request FAILED. The only one with a retry.
 *
 * The public props of the existing exports are unchanged; `action` and
 * `message` are additions.
 */

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  // Shapes where the content will be, not a spinner: the page fills in
  // instead of swapping. The words stay for screen readers.
  return (
    <div role="status" aria-busy="true" className="space-y-3 py-6">
      <span className="sr-only">{label ?? t("state.loading")}</span>
      <UiSkeleton className="h-12" />
      <UiSkeleton className="h-24" />
      <UiSkeleton className="h-12" />
    </div>
  );
}

/** The sunken panel the empty and unavailable states share. */
function StatePanel({
  glyph,
  children,
  action,
  className,
  compact,
  illustration,
}: {
  glyph: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  illustration?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-2.5 text-center",
        ui.radius.card,
        ui.surface.sunken,
        compact ? "px-4 py-6" : "px-6 py-10",
        ui.text.secondary,
        ui.tone.muted,
        className,
      )}
    >
      {illustration ? (
        <img
          src={illustration}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className={cn("drift-in w-auto max-w-full object-contain", compact ? "h-20" : "h-28")}
        />
      ) : (
        // The surface disc on the sunken panel: the same round icon plate the
        // boards put on shortcut tiles, one step lighter than its ground.
        <div
          className={cn(
            "grid h-11 w-11 place-items-center",
            ui.radius.full,
            ui.surface.bar,
            ui.tone.ink,
            ui.shadow.card,
          )}
          aria-hidden
        >
          {glyph}
        </div>
      )}
      <span className="max-w-[28ch]">{children}</span>
      {action ? <div className="flex flex-col items-center gap-1">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  children,
  className,
  compact,
  illustration,
  action,
}: {
  children?: ReactNode;
  className?: string;
  /** Reduces vertical padding for use inside compact rails. */
  compact?: boolean;
  /** An optional spot illustration (image URL) in place of the inbox glyph. */
  illustration?: string;
  /**
   * Where to go from here: buttons or links to what does exist (the next match
   * day, the latest results). Under the message, one per line.
   */
  action?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <StatePanel
      glyph={<Inbox className="h-5 w-5" aria-hidden />}
      action={action}
      className={className}
      compact={compact}
      illustration={illustration}
    >
      {children ?? t("state.empty")}
    </StatePanel>
  );
}

/**
 * The information is not available, and asking again will not change that: a
 * finished match the provider sent no statistics for, a squad nobody has
 * published. Not an error (nothing failed) and not an empty day (something was
 * expected), so it has its own glyph and never a retry.
 */
export function UnavailableState({
  children,
  className,
  compact,
}: {
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <StatePanel
      glyph={<CircleSlash className="h-5 w-5" aria-hidden />}
      className={className}
      compact={compact}
    >
      {children ?? t("state.unavailable")}
    </StatePanel>
  );
}

export function ErrorState({
  onRetry,
  message,
}: {
  /** Shown as the retry button: only a request that failed has one. */
  onRetry?: () => void;
  /** What could not be loaded, in the page's words; the generic line when absent. */
  message?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-3 px-4 py-8 text-center",
        ui.radius.card,
        "border border-[color:color-mix(in_oklab,var(--ui-negative)_30%,transparent)]",
        ui.text.body,
      )}
      style={{ background: "color-mix(in oklab, var(--ui-negative) 6%, var(--ui-surface))" }}
    >
      {/* The glyph on a 12% negative disc — the Profile log-out row's
          pairing — rather than a bare red triangle. */}
      <span
        className={cn("grid h-11 w-11 place-items-center", ui.radius.full, ui.tone.negative)}
        style={{ background: "color-mix(in oklab, var(--ui-negative) 12%, var(--ui-surface))" }}
        aria-hidden
      >
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <span className={cn(ui.tone.default, "[font-weight:var(--ui-weight-strong)]")}>
        {message ?? t("state.error")}
      </span>
      {onRetry && (
        <UiButton variant="ink" size="sm" onClick={onRetry}>
          {t("state.retry")}
        </UiButton>
      )}
    </div>
  );
}

export function OfflineBanner() {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 px-3.5 py-2",
        // The card radius, not a pill: the Arabic line can wrap, and a
        // two-line pill reads as a mistake.
        ui.radius.card,
        "border border-[color:color-mix(in_oklab,var(--ui-caution)_40%,transparent)]",
        ui.text.meta,
        "[font-weight:var(--ui-weight-strong)]",
      )}
      style={{
        background: "color-mix(in oklab, var(--ui-caution) 14%, var(--ui-surface))",
        color: "color-mix(in oklab, var(--ui-caution) 70%, var(--ui-on-surface))",
      }}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">{t("state.offline")}</span>
    </div>
  );
}
