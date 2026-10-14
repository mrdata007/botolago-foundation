import { UiAlert, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { TransferPreviewPanel } from "@/services/transfers-service";

/**
 * What the transfers screen says about the server's preview (FANT-02): that it
 * is being worked out, or why it did not come back and what to do about it.
 * It sits above the Add / Next dock, so "Suivant" is never grey without a
 * sentence next to it. The draft is not touched by anything here: the retry
 * asks the server again (or reloads the team when the version moved on).
 */
export function TransferPreviewNotice({
  panel,
  onRetry,
  retrying,
}: {
  panel: TransferPreviewPanel;
  onRetry: () => void;
  retrying: boolean;
}) {
  const { t, lang } = useI18n();
  if (panel.state === "none") return null;

  if (panel.state === "pending") {
    return (
      <UiAlert
        tone="info"
        icon={null}
        role="status"
        testId="transfer-preview-pending"
        className="mx-[var(--ui-gutter)] mt-3"
      >
        {t("fantasy.transfers.preview.pending")}
      </UiAlert>
    );
  }

  const { issue, retryable } = panel;
  const amount = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(issue.shortfall ?? 0);

  // Literal keys, one call each: the i18n gate cannot see a key built at runtime.
  const message =
    issue.kind === "budget"
      ? issue.shortfall !== null
        ? t("fantasy.transfers.preview.budget").replace("{amount}", amount)
        : t("fantasy.transfers.preview.budget_changed")
      : issue.kind === "stale"
        ? t("fantasy.transfers.preview.stale")
        : issue.kind === "step_up"
          ? t("fantasy.transfers.preview.step_up")
          : issue.kind === "network"
            ? t("fantasy.transfers.preview.network")
            : issue.kind === "locked"
              ? t("fantasy.transfers.error.deadline")
              : issue.kind === "permission"
                ? t("fantasy.error.permission")
                : t("fantasy.transfers.preview.failed");

  return (
    <UiAlert tone="negative" testId="transfer-preview-error" className="mx-[var(--ui-gutter)] mt-3">
      {/* The amount is a figure inside a sentence: isolated so it reads the same in Arabic. */}
      <p data-issue={issue.kind}>
        <bdi>{message}</bdi>
      </p>
      {retryable ? (
        <UiButton
          variant="soft"
          size="sm"
          className="mt-2"
          disabled={retrying}
          onClick={onRetry}
          data-testid="transfer-preview-retry"
        >
          {issue.kind === "stale" ? t("fantasy.error.reload_latest") : t("fantasy.error.retry")}
        </UiButton>
      ) : null}
    </UiAlert>
  );
}
