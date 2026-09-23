import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  // Auth screens are useful entry points for people, but should not compete
  // with public football pages in search results. Keep them crawlable so
  // search engines can read this rule.
  head: () => ({ meta: [{ name: "robots", content: "noindex, follow" }] }),
  component: () => <Outlet />,
});
