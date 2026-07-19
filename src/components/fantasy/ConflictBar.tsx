// Pass 3.2-H2 — Version-conflict resolution bar.
//
// Assertive live region so AT users know a mutation was rejected because
// the cloud snapshot advanced. Offers two localized choices:
//   - Reload latest → replace working state with the returned snapshot.
//   - Keep working → dismiss and continue editing the local draft.
//
// 44px minimum tap targets, RTL-safe logical layout, 320px wrap.

import { useI18n } from "@/i18n/provider";
import { AlertTriangle } from "lucide-react";

export interface ConflictBarProps {
  visible: boolean;
  onReloadLatest: () => void;
  onKeepWorking: () => void;
  /** Optional override for the explanation (e.g. permission_denied copy). */
  explanationKey?:
    | "fantasy.conflict.explain"
    | "fantasy.error.permission"
    | "fantasy.error.network";
  /** Optional title override; defaults to conflict title. */
  titleKey?: "fantasy.conflict.title" | "fantasy.error.version_conflict";
  busy?: boolean;
}

export function ConflictBar({
  visible,
  onReloadLatest,
  onKeepWorking,
  explanationKey = "fantasy.conflict.explain",
  titleKey = "fantasy.conflict.title",
  busy = false,
}: ConflictBarProps) {
  const { t } = useI18n();
  if (!visible) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-testid="conflict-bar-empty"
      />
    );
  }
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="conflict-bar"
      className="flex flex-col gap-2 rounded-xl border border-red-300/70 bg-red-50/85 px-3 py-2.5 text-red-900 shadow-sm backdrop-blur"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-700 ring-1 ring-red-500/30"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold break-words whitespace-normal">
            {t(titleKey)}
          </p>
          <p className="mt-0.5 text-[11px] break-words whitespace-normal">
            {t(explanationKey)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onReloadLatest}
          disabled={busy}
          className="inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-lg bg-[color:var(--brand-primary)] px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50"
        >
          {t("fantasy.conflict.reload_latest")}
        </button>
        <button
          type="button"
          onClick={onKeepWorking}
          disabled={busy}
          className="inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-lg border border-red-300 bg-white/70 px-3 py-1 text-[12px] font-bold text-red-900 disabled:opacity-50"
        >
          {t("fantasy.conflict.keep_working")}
        </button>
      </div>
    </div>
  );
}
