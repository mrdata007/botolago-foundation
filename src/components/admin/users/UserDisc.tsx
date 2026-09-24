import type { AdminUserDto } from "@/backend/admin/users-contracts";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { userInitial } from "./user-presentation";

/**
 * The account's initial on a disc -- the app's crest and icon disc. A banned
 * account's disc takes the negative tint, so a ban reads at a glance down the
 * list and not only from its badge. Decorative: the name is always written
 * beside it.
 */
export function UserDisc({
  user,
  size = "md",
}: {
  user: Pick<AdminUserDto, "displayName" | "username" | "activeBan">;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        size === "lg" ? "h-14 w-14" : "h-10 w-10",
        ui.radius.full,
        user.activeBan
          ? "bg-[color:color-mix(in_oklab,var(--ui-negative)_18%,transparent)] text-[color:var(--ui-negative)]"
          : cn(ui.surface.sunken, ui.tone.ink),
        size === "lg" ? ui.display.section : ui.text.bodyStrong,
      )}
      aria-hidden
    >
      {userInitial(user)}
    </span>
  );
}
