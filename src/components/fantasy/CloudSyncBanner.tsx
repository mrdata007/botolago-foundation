// Localized status banner for Fantasy cloud sync (Pass 3.1).
// Reads state from the owned-Fantasy provider. Renders nothing in
// guest/mock mode. Fully RTL and ≤ 320px safe.
//
// Converted to the kit (BG-0092). The three tones were written in the
// Tailwind named palette (`amber-500/10 text-amber-100`, `emerald-…`,
// `bg-white/5 text-white/80`) — colours that do not move with the theme, so
// in light mode the neutral tone rendered white-on-white. They are now
// `UiAlert`'s tones, which compose their fill from `--ui-positive` /
// `--ui-caution` / `--ui-ink-fg` over `--ui-surface` and keep
// `--ui-on-surface` as the foreground in both themes.
//
// Re-checked in the V2 pass and left alone. There is no literal white-alpha
// left here — `bg-white/5 text-white/80` is the state the comment above
// describes, not the state of the file — and no un-themed colour of any kind:
// every surface and foreground the banner draws comes from `UiAlert`. Nothing
// mounts it either; `<CloudSyncBanner />` appears in `src/` only as this
// export and as a name in the owned-provider's back-compat note.

import { UiAlert, UiButton, type UiAlertTone } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useFantasyCloudSyncStatus } from "@/services/fantasy-owned-provider";

export function CloudSyncBanner() {
  const { t } = useI18n();
  const { status, errorCode, isCloud, reload } = useFantasyCloudSyncStatus();
  if (!isCloud) return null;
  if (status === "idle") return null;

  // `negative` is not only the colour: it is the tone `UiAlert` gives
  // `role="alert"`, i.e. an assertive live region. The banner was explicitly
  // assertive for error and conflict ("a mutation was rejected") and polite
  // otherwise, and that behaviour is preserved by the tone choice.
  const tone: UiAlertTone =
    status === "conflict" || status === "error"
      ? "negative"
      : status === "saved"
        ? "positive"
        : "info";

  const label =
    status === "loading"
      ? t("fantasy.cloud.loading")
      : status === "saving"
        ? t("fantasy.cloud.saving")
        : status === "saved"
          ? t("fantasy.cloud.saved")
          : status === "conflict"
            ? t("fantasy.cloud.conflict")
            : errorCode === "permission_denied"
              ? t("fantasy.cloud.permission_denied")
              : errorCode === "network"
                ? t("fantasy.cloud.offline")
                : errorCode === "mapping_incomplete"
                  ? t("fantasy.cloud.mapping_unavailable")
                  : t("fantasy.cloud.error");

  const showRetry = status === "error" || status === "conflict";

  return (
    <div className="mx-3 mt-2">
      <UiAlert
        tone={tone}
        action={
          showRetry ? (
            <UiButton
              variant="outline"
              size="sm"
              onClick={() => {
                void reload();
              }}
            >
              {status === "conflict" ? t("fantasy.cloud.reload_latest") : t("fantasy.cloud.retry")}
            </UiButton>
          ) : undefined
        }
      >
        <span className="block min-w-0 whitespace-normal break-words">{label}</span>
      </UiAlert>
    </div>
  );
}
