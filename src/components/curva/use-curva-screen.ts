import type { UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ManagerCardError } from "@/backend/manager-card/errors";
import { fantasyHubLayout, type FantasyHubLayout } from "@/components/fantasy/fantasy-hub-layout";
import { useFantasyScreen, type FantasyScreenState } from "@/components/fpl/useFantasyScreen";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useMyManagerCard } from "@/services/use-manager-card";

import { homeState, registrationIsClosed, type CardRead, type HomeState } from "./curva-state";

/** The card query as the pure state functions read it. */
export function cardRead(query: UseQueryResult<MyCardDto | null, ManagerCardError>): CardRead {
  if (query.isError) {
    return {
      status: "error",
      code: query.error instanceof ManagerCardError ? query.error.code : null,
    };
  }
  if (query.data !== undefined) return { status: "success", card: query.data };
  return query.fetchStatus === "idle" ? { status: "idle" } : { status: "pending" };
}

export interface CurvaScreen {
  layout: FantasyHubLayout;
  screen: FantasyScreenState;
  query: UseQueryResult<MyCardDto | null, ManagerCardError>;
  state: HomeState;
  registrationClosed: boolean;
  /** Retry whatever failed: the card read, and the Fantasy screen under it. */
  retry: () => void;
}

/**
 * Who is looking at Curva and what they have: the Fantasy hub's own answer to "who" (so the
 * two sections agree about a guest, an account with no team and an owner), the card read, and
 * the state of the screen that follows from both. The card is asked for an owner only
 * (`useMyManagerCard` is disabled for anyone else), so no read can answer 404.
 */
export function useCurvaScreen(): CurvaScreen {
  const { status: authStatus } = useAuth();
  const screen = useFantasyScreen({ needsTeam: false, needsAuth: false });
  const { source } = useFantasyDataSource();
  const query = useMyManagerCard();
  const layout = fantasyHubLayout({
    authStatus,
    source,
    phase: screen.phase,
    hasTeam: screen.team !== null,
  });
  const registrationClosed = registrationIsClosed(screen.phase, screen.gameweek);
  const read = cardRead(query);
  const state = homeState({
    audience: layout.audience,
    phase: screen.phase,
    registrationClosed,
    read,
  });
  const retry = () => {
    void query.refetch();
    screen.retry();
  };
  return { layout, screen, query, state, registrationClosed, retry };
}
