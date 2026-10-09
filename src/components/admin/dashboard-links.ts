import type { AdminPermission } from "@/backend/admin/contracts";
import type { AdminUserStatus } from "@/backend/admin/users-contracts";
import type { EditorialStatus } from "@/backend/news/contracts";

/**
 * Where a dashboard tile's count can be read row by row: the list, opened
 * already filtered the way the tile counts. Only lists that exist and offer
 * that filter as a chip; the list reads it from `?status=` on arrival.
 */
export type StatTileLink =
  | {
      readonly to: "/admin/users";
      readonly search?: { readonly status: AdminUserStatus };
      readonly permission: AdminPermission;
    }
  | {
      readonly to: "/admin/news";
      readonly search?: { readonly status: EditorialStatus };
      readonly permission: AdminPermission;
    };

/**
 * The tiles that count a list the console already has. "Nouveaux" and
 * "Actifs" have no matching filter -- the user list's "Actifs" means "not
 * banned", not "active this week" -- so they stay plain tiles.
 *
 * `permission` is the list's own nav permission (`ADMIN_CONSOLE_NAV_ITEMS`):
 * a tile is a link only for staff whose role opens that list. The list's
 * loader checks it again either way.
 */
export const DASHBOARD_TILE_LINKS = {
  users: { to: "/admin/users", permission: "users.read_support" },
  banned: { to: "/admin/users", search: { status: "banned" }, permission: "users.read_support" },
  published: {
    to: "/admin/news",
    search: { status: "published" },
    permission: "editorial.read",
  },
} as const satisfies Record<string, StatTileLink>;

/** The tile's link, or `null` where the viewer's role does not open the list. */
export function statTileLink(
  link: StatTileLink,
  permissions: readonly string[],
): StatTileLink | null {
  return permissions.includes(link.permission) ? link : null;
}

/**
 * A `?status=` value a list accepts on arrival, or `undefined`. The lists
 * keep their filter in memory as before; this only seeds the first fetch, so
 * a tile can open them already filtered.
 */
export function arrivalStatus<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}
