import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/auth" || location.pathname === "/auth/") {
      throw redirect({ to: "/auth/login" });
    }
  },
  component: () => <Outlet />,
});
