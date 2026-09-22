// Pass 3.2-H2 — Unsaved-changes badge.
//
// Live status region announced politely for AT users. Optional inline Save
// action honors the 44px hit target and RTL logical flow. Text wraps at
// 320px; never truncated.
//
// Converted to the kit (BG-0092). It was `text-amber-900` on
// `bg-amber-50/85` behind a `backdrop-blur` — a light-only pair that goes
// invisible on a dark page. `UiAlert tone="caution"` mixes `--ui-caution`
// into `--ui-surface` and keeps `--ui-on-surface` as the foreground, so the
// badge reads in both themes and still announces politely (`role="status"`).
//
// The visible branch used to wrap the alert in a bare `<div>` whose only job
// was to carry `data-testid`. `UiAlert` forwards `testId` itself now, so the
// hook moves onto the alert and the spare box goes. The hidden branch keeps
// its own element: that one is not a badge, it is the always-mounted polite
// live region that exists so a later transition is announced at all.

import { CircleDot } from "lucide-react";

import { UiAlert, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";

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
    variant === "draft_restored" ? t("fantasy.status.draft_restored") : t("fantasy.status.unsaved");
  return (
    <UiAlert
      tone="caution"
      testId="unsaved-badge"
      icon={<CircleDot className="h-5 w-5" />}
      action={
        onSave ? (
          <UiButton variant="gradient" size="sm" onClick={onSave} disabled={saving}>
            {saving ? t("fantasy.status.saving") : t("fantasy.action.save")}
          </UiButton>
        ) : undefined
      }
    >
      <span className="block min-w-0 whitespace-normal break-words">{label}</span>
    </UiAlert>
  );
}
