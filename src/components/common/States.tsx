import { useI18n } from "@/i18n/provider";
import { AlertTriangle, Loader2, Inbox, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ui, UiButton } from "@/components/ui-kit";

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
 * The public props of every export are unchanged.
 */

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className={cn("flex items-center justify-center gap-2 py-8", ui.text.body, ui.tone.muted)}
    >
      <Loader2
        className={cn("h-4 w-4 animate-spin motion-reduce:animate-none", ui.tone.ink)}
        aria-hidden
      />
      <span>{label ?? t("state.loading")}</span>
    </div>
  );
}

export function EmptyState({
  children,
  className,
  compact,
  illustration,
}: {
  children?: ReactNode;
  className?: string;
  /** Reduces vertical padding for use inside compact rails. */
  compact?: boolean;
  /** An optional spot illustration (image URL) in place of the inbox glyph. */
  illustration?: string;
}) {
  const { t } = useI18n();
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
          className={cn("w-auto max-w-full object-contain", compact ? "h-20" : "h-28")}
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
          <Inbox className="h-5 w-5" aria-hidden />
        </div>
      )}
      <span className="max-w-[28ch]">{children ?? t("state.empty")}</span>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
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
        {t("state.error")}
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
