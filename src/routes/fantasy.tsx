import { createFileRoute, Outlet } from "@tanstack/react-router";

import { FantasyOnboarding } from "@/components/fantasy/FantasyOnboarding";
import { FantasyImportPrompt } from "@/components/fantasy/FantasyImportPrompt";

export const Route = createFileRoute("/fantasy")({
  head: () => ({
    meta: [
      { title: "Fantasy — BotolaGO" },
      {
        name: "description",
        content:
          "BotolaGO Fantasy : composez votre équipe Botola Pro, faites vos transferts et suivez vos points chaque journée.",
      },
      { property: "og:title", content: "Fantasy — BotolaGO" },
      {
        property: "og:description",
        content:
          "BotolaGO Fantasy : composez votre équipe Botola Pro, faites vos transferts et suivez vos points chaque journée.",
      },
    ],
  }),
  component: FantasyLayout,
});

/**
 * The Fantasy layout never gates its children.
 *
 * Every screen resolves its own availability / authentication / team state
 * through `useFantasyScreenState`, so a slow or failed backend request can
 * only ever degrade the one screen that depends on it, with a finite
 * loading state and an explicit retry.
 */
function FantasyLayout() {
  return (
    <>
      <Outlet />
      <FantasyImportPrompt />
      <FantasyOnboarding />
    </>
  );
}
