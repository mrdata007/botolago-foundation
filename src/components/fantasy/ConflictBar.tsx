// Pass 3.2-H2 — Version-conflict resolution bar.
//
// Assertive live region so AT users know a mutation was rejected because
// the cloud snapshot advanced. Offers two localized choices:
//   - Reload latest → replace working state with the returned snapshot.
//   - Keep working → dismiss and continue editing the local draft.
//
// 44px minimum tap targets, RTL-safe logical layout, 320px wrap.
//
// Converted to the kit (BG-0092). The bar was written in the Tailwind red
// palette over a `backdrop-blur` translucent fill — `text-red-900` on
// `bg-red-50/85` is unreadable once the page behind it is dark, and none of
// those values move with the theme. `UiAlert tone="negative"` composes its
// fill from `--ui-negative` over `--ui-surface` and keeps `role="alert"`, so
// the assertive announcement this component exists for is unchanged.
//
// The visible branch used to wrap the alert in a bare `<div>` whose only job
// was to carry `data-testid`. `UiAlert` forwards `testId` itself now, so the
// hook moves onto the alert and the spare box goes. The hidden branch keeps
// its own element: that one is not an alert, it is the always-mounted live
// region that exists so a later transition is announced at all.

import { UiAlert, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";

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
    <UiAlert tone="negative" title={t(titleKey)} testId="conflict-bar">
      <p className="whitespace-normal break-words">{t(explanationKey)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <UiButton
          variant="gradient"
          size="sm"
          onClick={onReloadLatest}
          disabled={busy}
          className="flex-1"
        >
          {t("fantasy.conflict.reload_latest")}
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          onClick={onKeepWorking}
          disabled={busy}
          className="flex-1"
        >
          {t("fantasy.conflict.keep_working")}
        </UiButton>
      </div>
    </UiAlert>
  );
}
