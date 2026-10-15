import { createFileRoute, redirect } from "@tanstack/react-router";

import { authNextSearch } from "@/lib/auth-callback";

/**
 * The bare `/auth` address. `/auth` is the layout parent of the sign-in
 * screens (`auth.tsx` renders only an `Outlet`), so on its own it rendered an
 * empty page (audit SOL-04). Nothing in the app links here, but a mistyped or
 * trimmed address lands on it, so it goes to the supported entry: the sign-in
 * screen. `replace` keeps the empty address out of the history.
 *
 * This is the index route only: `/auth/login`, `/auth/register` and the other
 * children are separate routes and are not touched.
 *
 * A `next` the address carries is run through the same sanitiser as every
 * other auth route (`authNextSearch`), so an off-site value is dropped and
 * never reaches the sign-in screen.
 */
export const Route = createFileRoute("/auth/")({
  validateSearch: (s: Record<string, unknown>) => authNextSearch(s.next),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/auth/login", search: { next: search.next }, replace: true });
  },
});
