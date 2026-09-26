import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import type { WeeklyEmailDto } from "@/backend/pepites/contracts";
import { ui, UiButton, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { pepitesService } from "@/services/pepites";

import { PepitesCard } from "./PepitesParts";
import { pepitesKeys } from "./use-pepites";

/**
 * The weekly email, opt-in only (architecture §5.4): off for everyone until
 * the reader turns it on here. A guest is asked to sign in first. When email
 * cannot reach the account (address not confirmed, email notifications off),
 * the card says why instead of pretending the switch works.
 */
export function WeeklyEmailCard() {
  const { t } = useI18n();
  const { user, status, requireAuth } = useAuth();
  const uid = status === "authenticated" ? (user?.id ?? null) : null;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: pepitesKeys.weeklyEmail(uid ?? "guest"),
    queryFn: ({ signal }) => pepitesService.myWeeklyEmail(signal),
    enabled: uid !== null,
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => pepitesService.setMyWeeklyEmail(enabled),
    onSuccess: (next: WeeklyEmailDto) => {
      if (uid) queryClient.setQueryData(pepitesKeys.weeklyEmail(uid), next);
      toast.success(next.enabled ? t("pepites.email.on_toast") : t("pepites.email.off_toast"));
    },
    onError: () => toast.error(t("pepites.email.error")),
  });

  const header = (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center",
          ui.radius.full,
          ui.surface.sunken,
          ui.tone.ink,
        )}
      >
        <Mail className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={ui.text.bodyStrong}>{t("pepites.email.title")}</p>
        <p className={cn(ui.text.meta, ui.tone.muted)}>{t("pepites.email.body")}</p>
      </div>
    </div>
  );

  if (!uid) {
    return (
      <PepitesCard testId="pepites-email-card">
        <div className="flex flex-col gap-3">
          {header}
          <UiButton
            variant="soft"
            disabled={status === "loading"}
            onClick={() => requireAuth(() => {}, { reason: t("pepites.email.sign_in_reason") })}
          >
            {t("pepites.email.sign_in")}
          </UiButton>
        </div>
      </PepitesCard>
    );
  }

  const data = query.data;
  const enabled = mutation.isPending ? mutation.variables === true : (data?.enabled ?? false);
  const blocker = data?.blockers[0] ?? null;
  return (
    <PepitesCard testId="pepites-email-card">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">{header}</div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={t("pepites.email.title")}
            disabled={!data || mutation.isPending}
            onClick={() => mutation.mutate(!enabled)}
            data-testid="pepites-email-switch"
            className={cn(
              "grid shrink-0 place-items-center disabled:opacity-50",
              ui.space.tap,
              ui.radius.full,
              ui.focus,
            )}
          >
            <span
              aria-hidden
              className={cn("relative block h-8 w-14 transition-colors", ui.radius.full)}
              style={{
                backgroundColor: enabled ? "var(--ui-positive)" : "var(--ui-surface-sunken)",
              }}
            >
              <span
                className={cn(
                  "absolute top-1 h-6 w-6 transition-[inset-inline-start]",
                  ui.radius.full,
                  ui.shadow.card,
                  enabled ? "start-7" : "start-1",
                )}
                style={{ backgroundColor: "var(--ui-surface)" }}
              />
            </span>
          </button>
        </div>
        {query.isError ? (
          <p className={cn(ui.text.meta, ui.tone.negative)}>{t("pepites.email.error")}</p>
        ) : null}
        {data && data.enabled && blocker ? (
          <div className="flex flex-col gap-2" data-testid="pepites-email-blocker">
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {blocker === "email_unconfirmed"
                ? t("pepites.email.blocker_unconfirmed")
                : blocker === "guest_account"
                  ? t("pepites.email.blocker_guest")
                  : t("pepites.email.blocker_off")}
            </p>
            {blocker === "notifications_off" || blocker === "email_off" ? (
              <UiLinkButton to="/profile" size="sm" variant="soft" className="self-start">
                {t("pepites.email.settings")}
              </UiLinkButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </PepitesCard>
  );
}
