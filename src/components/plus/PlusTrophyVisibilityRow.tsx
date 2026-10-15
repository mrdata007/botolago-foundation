import { Eye, EyeOff } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useMyTrophies } from "@/services/use-trophies";

import { useTrophyCopy } from "./trophy-copy";
import { useTrophyVisibilitySwitch } from "./use-trophy-visibility";

/**
 * « Montrer mes trophées » in Profil › Mon abonnement: the same switch as on the trophies page,
 * read from and written to the same cabinet. Nothing until the cabinet has been read (the feature is
 * off, or the database does not answer), so it never asks for more than the trophies page does.
 */
export function PlusTrophyVisibilityRow({ ruled = false }: { ruled?: boolean }) {
  const query = useMyTrophies(true);
  const cabinet = query.data ?? null;
  if (!cabinet) return null;
  return <Row current={cabinet.showToLeagues} ruled={ruled} />;
}

function Row({ current, ruled }: { current: boolean; ruled: boolean }) {
  const c = useTrophyCopy();
  const { on, pending, flip } = useTrophyVisibilitySwitch(current);
  const Icon = on ? Eye : EyeOff;
  return (
    <div
      className={cn("flex w-full items-center gap-3 px-4 py-3", ruled && ui.rule.blockStart)}
      data-testid="plus-hub-trophies-visibility"
    >
      <span
        aria-hidden
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center [&_svg]:h-4.5 [&_svg]:w-4.5",
          ui.radius.full,
          ui.surface.sunken,
          ui.tone.ink,
        )}
      >
        <Icon />
      </span>
      <span className="min-w-0 flex-1">
        <span
          id="plus-hub-trophies-visibility-label"
          className={cn("block text-pretty", ui.text.bodyStrong, ui.tone.default)}
        >
          {c.t("plus.tr.vis_label")}
        </span>
        <span
          id="plus-hub-trophies-visibility-hint"
          className={cn("mt-0.5 block text-pretty", ui.text.meta, ui.tone.muted)}
        >
          {c.t("plus.tr.vis_hint")}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="plus-hub-trophies-visibility-label"
        aria-describedby="plus-hub-trophies-visibility-hint"
        disabled={pending}
        onClick={flip}
        data-testid="plus-hub-trophies-visibility-switch"
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
          style={{ backgroundColor: on ? "var(--ui-positive)" : "var(--ui-surface-sunken)" }}
        >
          <span
            className={cn(
              "absolute top-1 h-6 w-6 transition-[inset-inline-start]",
              ui.radius.full,
              ui.shadow.card,
              on ? "start-7" : "start-1",
            )}
            style={{ backgroundColor: "var(--ui-surface)" }}
          />
        </span>
      </button>
    </div>
  );
}
