import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { PepitesComparePage } from "@/components/pepites/PepitesComparePage";
import {
  isPlayerId,
  pepitesPageHeaders,
  prefetchPointer,
} from "@/components/pepites/pepites-route";
import { fr } from "@/i18n/dictionary-fr";
import { isServerRender, ssrAvailability } from "@/lib/ssr-prefetch";

interface CompareSearch {
  a?: string;
  b?: string;
}

export const Route = createFileRoute("/pepites/comparer")({
  validateSearch: (search: Record<string, unknown>): CompareSearch => ({
    ...(typeof search.a === "string" && isPlayerId(search.a) ? { a: search.a } : {}),
    ...(typeof search.b === "string" && isPlayerId(search.b) ? { b: search.b } : {}),
  }),
  loader: async ({ context }) => {
    if (!isServerRender()) return null;
    await prefetchPointer(context.queryClient);
    return ssrAvailability(context.queryClient) ?? { cache: "private" as const };
  },
  headers: ({ loaderData }) => pepitesPageHeaders(loaderData),
  head: () => ({
    meta: [{ title: fr["pepites.compare.title"] }, { name: "robots", content: "noindex" }],
  }),
  component: CompareRoute,
});

function CompareRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/pepites/comparer" });
  return (
    <PepitesComparePage
      firstId={search.a ?? null}
      secondId={search.b ?? null}
      onSelect={(side, id) => void navigate({ search: { ...search, [side]: id }, replace: true })}
    />
  );
}
