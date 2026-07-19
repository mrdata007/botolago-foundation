// Localized status banner for Fantasy cloud sync (Pass 3.1).
// Reads state from the owned-Fantasy provider. Renders nothing in
// guest/mock mode. Fully RTL and ≤ 320px safe.

import { useI18n } from "@/i18n/provider";
import { useFantasyCloudSyncStatus } from "@/services/fantasy-owned-provider";

export function CloudSyncBanner() {
  const { t } = useI18n();
  const { status, errorCode, isCloud, reload } = useFantasyCloudSyncStatus();
  if (!isCloud) return null;
  if (status === "idle") return null;

  const tone =
    status === "conflict" || status === "error"
      ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
      : status === "saved"
        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
        : "border-white/10 bg-white/5 text-white/80";

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
  const live: "polite" | "assertive" = showRetry ? "assertive" : "polite";

  return (
    <div
      role="status"
      aria-live={live}
      className={`mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${tone}`}
    >
      <span className="min-w-0 flex-1 break-words whitespace-normal">{label}</span>
      {showRetry && (
        <button
          type="button"
          onClick={() => {
            void reload();
          }}
          className="shrink-0 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-medium hover:bg-white/20 min-h-11"
        >
          {status === "conflict" ? t("fantasy.cloud.reload_latest") : t("fantasy.cloud.retry")}
        </button>
      )}
    </div>
  );
}
