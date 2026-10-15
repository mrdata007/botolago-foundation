import { toast } from "sonner";

import { useSetTrophiesVisibility } from "@/services/use-trophies";

import { useTrophyCopy } from "./trophy-copy";

/**
 * « Montrer mes trophées »: the value the switch shows, and the way to flip it. The two places that
 * show the switch (the trophies page and Profil › Ma saison) share this, and the cached cabinet,
 * so they always agree. A toast says what changed, or that it could not be saved.
 */
export function useTrophyVisibilitySwitch(current: boolean) {
  const c = useTrophyCopy();
  const mutation = useSetTrophiesVisibility();
  const flip = () =>
    mutation.mutate(!current, {
      onSuccess: (answer) => {
        if (answer.available)
          toast.success(answer.showToLeagues ? c.t("plus.tr.vis_on") : c.t("plus.tr.vis_off"));
      },
      onError: () => toast.error(c.t("plus.tr.vis_failed")),
    });
  return { on: current, pending: mutation.isPending, flip };
}
