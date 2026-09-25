import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/pronostics/ligues`: the leagues live in the page's "Ligues" tab. */
export const Route = createFileRoute("/pronostics/ligues/")({
  beforeLoad: () => {
    throw redirect({ to: "/pronostics", search: { tab: "ligues" }, replace: true });
  },
});
