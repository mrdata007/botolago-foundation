import { createFileRoute } from "@tanstack/react-router";
import { RivalryPage } from "@/components/matches/RivalryPage";
import { unavailableHeaders } from "@/lib/page-availability";
import { rivalryRouteHead, rivalryRouteLoader } from "@/lib/rivalry-route";

export const Route = createFileRoute("/classico-wac-far")({
  loader: ({ context }) => rivalryRouteLoader(context.queryClient, "classico-wac-far"),
  headers: ({ loaderData }) => unavailableHeaders(loaderData),
  head: ({ loaderData }) => rivalryRouteHead("classico-wac-far", loaderData),
  component: () => <RivalryPage rivalryKey="classico-wac-far" />,
});
