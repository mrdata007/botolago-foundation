import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { requireAuthStep } from "@/auth/second-factor";
import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import { PepitesError } from "@/backend/pepites/errors";
import { UiButton, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { pepitesService } from "@/services/pepites";
import { cn } from "@/lib/utils";

import { formatCount } from "./pepites-format";
import { followStateQueryOptions, pepitesKeys, usePepitesViewer } from "./use-pepites";

/**
 * "＋ Suivre" on the player hero (Figma 03 / S4). A signed-in account
 * follows or unfollows directly; anyone else (no session, a guest, or an
 * account still owing its second factor) sees a sheet built to follow this
 * one player, mirroring S4 — a generic sign-in prompt would not say what
 * following buys them.
 */
export function PepitesFollowButton({
  playerId,
  playerName,
  testId = "pepites-follow",
}: {
  playerId: string;
  playerName: string;
  testId?: string;
}) {
  const { t, lang } = useI18n();
  const { status, requireAuth } = useAuth();
  const viewer = usePepitesViewer();
  const queryClient = useQueryClient();
  const opener = useRef<HTMLButtonElement>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const query = useQuery(followStateQueryOptions(viewer, playerId));
  const state = query.data;
  const known = state?.available === true && state.found === true;
  const following = state?.available && state.found ? (state.following ?? false) : false;
  const followers = state?.available && state.found ? (state.followers ?? 0) : null;

  const mutation = useMutation({
    mutationFn: (follow: boolean) => pepitesService.setFollow(playerId, follow),
    onSuccess: (result) => {
      queryClient.setQueryData(pepitesKeys.follow(viewer, playerId), result);
      void queryClient.invalidateQueries({ queryKey: ["pepites", viewer, "ranking"] });
      toast.success(
        result.available && result.found && result.following
          ? t("pepites.follow.followed").replace("{name}", playerName)
          : t("pepites.follow.unfollowed").replace("{name}", playerName),
      );
    },
    onError: (error) => {
      if (isMfaStepUpError(error)) {
        showStepUpNotice(t);
        return;
      }
      if (error instanceof PepitesError && error.code === "follow_limit") {
        toast.error(t("pepites.follow.limit"));
        return;
      }
      if (error instanceof PepitesError && error.code === "account_required") {
        toast.error(t("pepites.follow.account_required"));
        return;
      }
      toast.error(t("pepites.follow.failed"));
    },
  });

  const onPress = () => {
    if (status === "loading") return;
    if (status === "authenticated") {
      if (!known || query.isError || query.isFetching) return;
      mutation.mutate(!following);
      return;
    }
    if (requireAuthStep(status) === "challenge") {
      requireAuth(() => {
        // The account's state was unknown before its second factor completed.
        void pepitesService
          .followState(playerId)
          .then((latest) => {
            if (latest.available && latest.found) mutation.mutate(!latest.following);
            else toast.error(t("pepites.follow.read_failed"));
          })
          .catch(() => toast.error(t("pepites.follow.read_failed")));
      });
      return;
    }
    setGuestOpen(true);
  };

  const label = following ? t("pepites.follow.button_active") : t("pepites.follow.button");
  const withCount =
    followers !== null
      ? label.replace("{n}", formatCount(followers, lang))
      : t("pepites.follow.button_unknown");

  return (
    <>
      <button
        type="button"
        ref={opener}
        aria-pressed={known ? following : undefined}
        aria-busy={status === "loading" || query.isFetching || mutation.isPending}
        disabled={
          mutation.isPending ||
          status === "loading" ||
          (status === "authenticated" && (!known || query.isError || query.isFetching))
        }
        onClick={onPress}
        data-testid={testId}
        className={cn(
          "inline-flex h-[38px] min-h-[var(--ui-tap-min)] items-center justify-center gap-1.5 rounded-full border px-[18px] text-[13px] text-white",
          "[font-weight:var(--ui-weight-heavy)]",
          "disabled:opacity-60",
          following ? "border-white/35 bg-white/[0.2]" : "border-white/20 bg-white/[0.08]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        )}
      >
        {following ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Plus className="h-3.5 w-3.5" aria-hidden />
        )}
        <bdi>{withCount}</bdi>
      </button>
      {query.isError ? (
        <span role="status" className="text-[12px] text-white">
          {t("pepites.follow.read_failed")}{" "}
          <button
            type="button"
            data-testid={`${testId}-retry`}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            className="underline focus-visible:outline focus-visible:outline-2"
          >
            {t("state.retry")}
          </button>
        </span>
      ) : null}
      <FollowGuestSheet
        open={guestOpen}
        onOpenChange={setGuestOpen}
        playerName={playerName}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
        }}
      />
    </>
  );
}

/** Figma S4: a sheet, not the generic sign-in prompt, so it names what following buys. */
function FollowGuestSheet({
  open,
  onOpenChange,
  playerName,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigating = useRef(false);
  const go = (to: "/auth/login" | "/auth/register") => {
    navigating.current = true;
    onOpenChange(false);
    void navigate({ to, search: { next: pathname } });
  };
  return (
    <UiSheet
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={(event) => {
        if (navigating.current) {
          event.preventDefault();
          navigating.current = false;
        } else onCloseAutoFocus(event);
      }}
      title={t("pepites.follow.sheet_title").replace("{name}", playerName)}
      description={t("pepites.follow.sheet_body")}
    >
      <div className="flex flex-col gap-3 p-4">
        <UiButton variant="gradient" onClick={() => go("/auth/register")}>
          {t("pepites.follow.create_account")}
        </UiButton>
        <UiButton variant="ink" onClick={() => go("/auth/login")}>
          {t("pepites.follow.have_account")}
        </UiButton>
      </div>
    </UiSheet>
  );
}
