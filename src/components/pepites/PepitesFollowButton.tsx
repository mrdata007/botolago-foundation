import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { requireAuthStep } from "@/auth/second-factor";
import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import { PepitesError } from "@/backend/pepites/errors";
import { ui, UiButton, UiSheet } from "@/components/ui-kit";
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
 *
 * A kit pill (`UiButton size="sm"`) with `aria-pressed`: the navy `ink`
 * pill while the reader does not follow (the copy carries its own "＋"),
 * the quiet `soft` pill with a check once they do, so the two states differ
 * in more than a word.
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
  // The control the guest sheet hands focus back to when it closes.
  const openerId = useId();
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
      <UiButton
        id={openerId}
        size="sm"
        variant={following ? "soft" : "ink"}
        aria-pressed={known ? following : undefined}
        aria-busy={status === "loading" || query.isFetching || mutation.isPending}
        disabled={
          mutation.isPending ||
          status === "loading" ||
          (status === "authenticated" && (!known || query.isError || query.isFetching))
        }
        onClick={onPress}
        data-testid={testId}
      >
        {following ? <Check className="h-4 w-4" aria-hidden /> : null}
        <bdi>{withCount}</bdi>
      </UiButton>
      {query.isError ? (
        <span
          role="status"
          className={cn("inline-flex flex-wrap items-center gap-2", ui.text.meta, ui.tone.muted)}
        >
          {t("pepites.follow.read_failed")}
          <UiButton
            size="sm"
            variant="soft"
            data-testid={`${testId}-retry`}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t("state.retry")}
          </UiButton>
        </span>
      ) : null}
      <FollowGuestSheet
        open={guestOpen}
        onOpenChange={setGuestOpen}
        playerName={playerName}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(openerId)?.focus();
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
