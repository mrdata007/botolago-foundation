import { createFileRoute } from "@tanstack/react-router";
import { RivalryPage } from "@/components/matches/RivalryPage";
import { unavailableHeaders } from "@/lib/page-availability";
import { rivalryRouteHead, rivalryRouteLoader } from "@/lib/rivalry-route";

export const Route = createFileRoute("/derby-casablanca")({
  loader: ({ context }) => rivalryRouteLoader(context.queryClient, "derby-casablanca"),
  headers: ({ loaderData }) => unavailableHeaders(loaderData),
  head: ({ loaderData }) => rivalryRouteHead("derby-casablanca", loaderData),
  component: () => <RivalryPage rivalryKey="derby-casablanca" />,
});
