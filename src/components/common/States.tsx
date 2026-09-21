import { useI18n } from "@/i18n/provider";
import { AlertTriangle, Loader2, Inbox, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ui, UiButton } from "@/components/ui-kit";

/**
 * Loading / empty / error / offline states.
 *
 * Converted to the shared UI kit: the kit type scale, radii, surfaces and
 * status tokens replace the Design System V2 surfaces, the Tailwind type
 * ramp and the hardcoded amber/destructive palettes. They stay calm and
 * quiet — the states are not decoration.
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
        "flex min-w-0 flex-col items-center justify-center gap-2 text-center",
        ui.radius.control,
        "border border-dashed border-[color:var(--ui-rule)]",
        ui.surface.sunken,
        compact ? "px-4 py-6" : "px-6 py-10",
        ui.text.secondary,
        ui.tone.muted,
        className,
      )}
    >
      <div
        className={cn("grid h-9 w-9 place-items-center rounded-full", ui.tone.ink)}
        style={{ background: "color-mix(in oklab, var(--ui-ink) 12%, transparent)" }}
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
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-3 py-8",
        ui.radius.control,
        "border border-[color:color-mix(in_oklab,var(--ui-negative)_35%,transparent)]",
        ui.text.body,
      )}
      style={{ background: "color-mix(in oklab, var(--ui-negative) 6%, transparent)" }}
    >
      <AlertTriangle className="h-5 w-5 text-[color:var(--ui-negative)]" aria-hidden />
      <span className={ui.tone.default}>{t("state.error")}</span>
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
        "flex min-w-0 items-center gap-2 px-3 py-2",
        ui.radius.control,
        "border border-[color:color-mix(in_oklab,var(--ui-caution)_40%,transparent)]",
        ui.text.meta,
      )}
      style={{
        background: "color-mix(in oklab, var(--ui-caution) 14%, transparent)",
        color: "color-mix(in oklab, var(--ui-caution) 70%, var(--ui-on-surface))",
      }}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>{t("state.offline")}</span>
    </div>
  );
}
