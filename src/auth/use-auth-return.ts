import { useRouterState } from "@tanstack/react-router";

import { authReturnTarget } from "@/lib/auth-callback";

/**
 * The search for a link to `/auth/login` or `/auth/register` that brings the
 * reader back to the page they are on, with its query and hash. `next` is
 * absent on the home page, which is where an auth page lands anyway.
 *
 * The router state is read as a string so the component re-renders only when
 * the destination changes.
 */
export function useAuthReturnSearch(): { next?: string } {
  const next = useRouterState({
    select: (state) =>
      authReturnTarget({
        pathname: state.location.pathname,
        searchStr: state.location.searchStr,
        hash: state.location.hash,
      }) ?? "",
  });
  return next ? { next } : {};
}
