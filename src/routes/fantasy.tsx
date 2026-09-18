import { createFileRoute, Outlet } from "@tanstack/react-router";

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
 * The Fantasy layout never gates its children and adds no overlay of its own.
 *
 * Every screen resolves its own availability / authentication / team state
 * through `useFantasyScreen`, so a slow or failed backend request can only
 * ever degrade the one screen that depends on it, with a finite loading state
 * and an explicit retry. The reference screens carry no welcome or import
 * dialogs, so none are mounted here.
 */
function FantasyLayout() {
  return <Outlet />;
}
