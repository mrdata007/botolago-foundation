import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/demo` opens the pitch demo, a static page served from `public/demo/`
 * (built by `bun run demo:publish`, see demo/README.md). The demo is not part
 * of the app, so this route only sends the visitor to its page: the file is
 * named explicitly because the app's router answers `/demo/` itself.
 */
export const Route = createFileRoute("/demo")({
  beforeLoad: () => {
    throw redirect({ href: "/demo/index.html", replace: true });
  },
});
