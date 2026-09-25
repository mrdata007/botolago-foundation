import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import {
  FOLLOWED_TEAM_IDS_QUERY_KEY,
  followService,
  followedTeamIdsQuery,
} from "@/services/follows";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";

/**
 * "Suivre" on a club page: a pill on the club's colour. Not following, it is
 * glass — a 16% wash of the on-club colour, like every control on a club
 * block; following, it is the surface disc's paint with a check, so the two
 * states differ in more than a word.
 *
 * The followed ids share their query with News and Profile, which is what
 * makes a follow here show up in "Mes clubs" at once. The query is keyed by
 * the account, so a second account on the same phone never reads the first
 * one's clubs (and never "unfollows" a club it did not follow). A visitor who
 * is not signed in is asked to sign in first (`requireAuth`), as on News. Mock
 * auth has no follow store behind it, so the list is not asked for there.
 */
export function ClubFollowButton({ club }: { club: Club }) {
  const { t, tr } = useI18n();
  const { user, requireAuth } = useAuth();
  const queryClient = useQueryClient();
  const followedQ = useQuery(followedTeamIdsQuery(user?.id ?? null));
  const following = followedQ.data?.includes(club.id) ?? false;
  const mutation = useMutation({
    mutationFn: (follow: boolean) =>
      follow ? followService.followTeam(club.id) : followService.unfollowTeam(club.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FOLLOWED_TEAM_IDS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["identity", "followed-teams"] });
    },
    // A refusal for want of the one-time code is not "an error occurred": it
    // says what is missing (the gate says the same under the same toast id,
    // so it shows once) while the auth layer takes the reader to the code.
    onError: (error) => {
      if (isMfaStepUpError(error)) showStepUpNotice(t);
      else toast.error(t("state.error"));
    },
  });

  return (
    <button
      type="button"
      aria-pressed={following}
      disabled={mutation.isPending}
      onClick={() => requireAuth(() => mutation.mutate(!following))}
      className={cn(
        "inline-flex min-h-[var(--ui-tap-min)] items-center gap-1.5 pe-4 ps-3",
        "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
        ui.radius.full,
        ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
        "transition-[filter,opacity] disabled:opacity-60",
        following
          ? cn(ui.club.inverse, ui.shadow.card)
          : cn("bg-[color:color-mix(in_srgb,var(--ui-on-club)_16%,transparent)]", ui.tone.onClub),
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-on-club)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
      )}
    >
      {following ? <Check aria-hidden /> : <Plus aria-hidden />}
      {following ? t("news.following") : t("news.follow")}
      {/* "Suivre" alone does not say what is followed. */}
      <span className="sr-only">{` ${tr(club.name)}`}</span>
    </button>
  );
}
