import { useI18n } from "@/i18n/provider";
import { AlertTriangle, Loader2, Inbox, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Design System V2 — Loading / empty / error / offline states.
 *
 * Loading and empty states are calm, editorial, and use the same surface
 * tokens as final content so transitions feel intentional. They are also
 * intentionally quiet — no over-designed decoration.
 */

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-8 text-sm text-[color:var(--text-muted)]"
    >
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
      <span>{label ?? t("state.loading")}</span>
    </div>
  );
}

export function EmptyState({
  children,
  className,
  compact,
}: {
  children?: ReactNode;
  className?: string;
  /** Reduces vertical padding for use inside compact rails. */
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        "rounded-[var(--radius-card-lg)] border border-dashed border-[var(--border-subtle)]",
        "bg-[color:var(--surface)]/40",
        compact ? "px-4 py-6" : "px-6 py-10",
        "text-sm text-[color:var(--text-secondary)]",
        className,
      )}
    >
      <div
        className="grid h-9 w-9 place-items-center rounded-full"
        style={{
          background: "color-mix(in oklab, var(--brand-accent) 10%, transparent)",
          color: "var(--brand-accent)",
        }}
        aria-hidden
      >
        <Inbox className="h-4 w-4" aria-hidden />
      </div>
      <span className="max-w-[28ch]">{children ?? t("state.empty")}</span>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card-lg)] border border-destructive/30 bg-destructive/5 py-8 text-sm">
      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
      <span className="text-foreground">{t("state.error")}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className={cn(
            "min-h-9 rounded-lg bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2",
          )}
        >
          {t("state.retry")}
        </button>
      )}
    </div>
  );
}

export function OfflineBanner() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
      <WifiOff className="h-4 w-4" aria-hidden />
      <span>{t("state.offline")}</span>
    </div>
  );
}
