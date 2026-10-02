/**
 * The demo app: the product's providers, a hash router over the demo's
 * screens (hash, so the single page works from any address, including a
 * file), and the bridge to the presenter page.
 *
 * Paths are the product's own, so the bottom navigation, back buttons and
 * links inside the real components land where they would on botolago.com.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/i18n/provider";

import { PresenterBridge } from "./bridge";
import { CreateScreen } from "./screens/Create";
import { HubScreen } from "./screens/Hub";
import { MatchdayScreen } from "./screens/Matchday";
import { CalendarScreen, ElsewhereScreen, PrizesScreen, WelcomeRoute } from "./screens/Other";
import { PointsScreen } from "./screens/Points";
import { RankingsScreen } from "./screens/Rankings";
import { StandingsScreen } from "./screens/Standings";
import { DemoStateProvider, useDemo } from "./state";
import { DemoUiProvider } from "./ui-state";

function Root() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => window.scrollTo(0, 0), [path]);
  return (
    <>
      <Outlet />
      <PresenterBridge />
      <Toaster />
    </>
  );
}

/** "Mon équipe", the profile and transfers all mean "my team" here. */
function TeamRedirect() {
  const { state } = useDemo();
  const to = state.played
    ? "/fantasy/points"
    : state.saved
      ? "/fantasy/matchday"
      : "/fantasy/create";
  return <Navigate to={to} replace />;
}

const rootRoute = createRootRoute({ component: Root, notFoundComponent: ElsewhereScreen });
const route = (path: string, component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => rootRoute, path, component });

const routeTree = rootRoute.addChildren([
  route("/", WelcomeRoute),
  route("/fantasy", HubScreen),
  route("/fantasy/create", CreateScreen),
  route("/fantasy/matchday", MatchdayScreen),
  route("/fantasy/points", PointsScreen),
  route("/fantasy/rankings", RankingsScreen),
  route("/fantasy/team", TeamRedirect),
  route("/fantasy/profile", TeamRedirect),
  route("/fantasy/transfers", TeamRedirect),
  route("/matches", CalendarScreen),
  route("/matches/standings", StandingsScreen),
  route("/prizes", PrizesScreen),
  route("$", ElsewhereScreen),
]);

const router = createRouter({ routeTree, history: createHashHistory() });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <DemoStateProvider>
          <DemoUiProvider>
            <RouterProvider router={router} />
          </DemoUiProvider>
        </DemoStateProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
