import type { TranslationKey } from "@/i18n/dictionaries";
import type { TransferPreviewIssue } from "@/services/transfers-service";

/**
 * The sentence for a failed transfer preview, cut around the amount (budget
 * with a known shortfall) so only the figure is isolated for bidi. Literal
 * keys, one call each: the i18n gate cannot see a key built at runtime. Kept
 * out of the component so the French and the Arabic wording are both testable
 * (server rendering is French).
 */
export function previewNoticeParts(
  issue: TransferPreviewIssue,
  t: (key: TranslationKey) => string,
  amount: string,
): { before: string; amount: string | null; after: string } {
  if (issue.kind === "budget" && issue.shortfall !== null) {
    const [before = "", after = ""] = t("fantasy.transfers.preview.budget").split("{amount}");
    return { before, amount, after };
  }
  const message =
    issue.kind === "budget"
      ? t("fantasy.transfers.preview.budget_changed")
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
                : issue.kind === "invalid"
                  ? t("fantasy.transfers.preview.invalid")
                  : t("fantasy.transfers.preview.failed");
  return { before: message, amount: null, after: "" };
}
