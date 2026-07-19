// Pass 3.2-H2 — Unsaved-changes badge.
//
// Live status region announced politely for AT users. Optional inline Save
// action honors the 44px hit target and RTL logical flow. Text wraps at
// 320px; never truncated.

import { useI18n } from "@/i18n/provider";
import { CircleDot } from "lucide-react";

export interface UnsavedBadgeProps {
  /** When false, the badge does not render (kept in DOM only when useful). */
  visible: boolean;
  /** Announce "draft restored" once, then fall back to "unsaved". */
  variant?: "unsaved" | "draft_restored";
  /** Optional inline Save affordance. */
  onSave?: () => void;
  /** Disable Save while a mutation is in flight. */
  saving?: boolean;
}

export function UnsavedBadge({
  visible,
  variant = "unsaved",
  onSave,
  saving = false,
}: UnsavedBadgeProps) {
  const { t } = useI18n();
  if (!visible) {
    // Keep the live region present so subsequent state transitions are
    // announced by assistive tech; render nothing visible.
    return (
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="unsaved-badge-empty"
      />
    );
  }
  const label =
    variant === "draft_restored"
      ? t("fantasy.status.draft_restored")
      : t("fantasy.status.unsaved");
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="unsaved-badge"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50/85 px-3 py-2 text-[12px] font-semibold text-amber-900 shadow-sm backdrop-blur"
    >
      <span
        aria-hidden
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30"
      >
        <CircleDot className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 break-words whitespace-normal">
        {label}
      </span>
      {onSave ? (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="ms-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-[color:var(--brand-primary)] px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50"
        >
          {saving ? t("fantasy.status.saving") : t("fantasy.action.save")}
        </button>
      ) : null}
    </div>
  );
}
