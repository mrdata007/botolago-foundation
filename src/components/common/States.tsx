import { useI18n } from "@/i18n/provider";
import { AlertTriangle, Loader2, Inbox, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
      <span>{label ?? t("state.loading")}</span>
    </div>
  );
}

export function EmptyState({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--glass-border)] bg-white/30 py-10 text-sm text-muted-foreground">
      <Inbox className="h-5 w-5" aria-hidden />
      <span>{children ?? t("state.empty")}</span>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 py-8 text-sm">
      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
      <span className="text-foreground">{t("state.error")}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white"
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
