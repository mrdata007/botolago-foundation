import { UiAlert, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";

/**
 * UX-003 — said under or beside a league list when a read failed: either the
 * list is the last one read (a refresh failed) or part of it could not be read.
 * Always with the way to try again.
 */
export function LeagueReadNotice({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <UiAlert
      tone="caution"
      className={className}
      action={
        <UiButton size="sm" variant="soft" onClick={onRetry}>
          {t("state.retry")}
        </UiButton>
      }
    >
      {message}
    </UiAlert>
  );
}
