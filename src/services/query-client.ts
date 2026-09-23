import { QueryClient } from "@tanstack/react-query";

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid reloading the same home and football data on quick route
        // changes. Mutations invalidate affected queries; match data still
        // refreshes on focus once this short window has elapsed.
        staleTime: 15_000,
      },
    },
  });
}
