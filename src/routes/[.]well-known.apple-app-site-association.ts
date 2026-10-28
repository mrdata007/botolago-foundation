import { createFileRoute } from "@tanstack/react-router";
import { APPLE_APP_SITE_ASSOCIATION } from "@/lib/app-links";

/**
 * /.well-known/apple-app-site-association (ST-2). Apple reads it with no file
 * extension and requires JSON served as is, with no redirect; a server route
 * says `application/json` on every host, which a static file without an
 * extension does not.
 */
export const Route = createFileRoute("/.well-known/apple-app-site-association")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(APPLE_APP_SITE_ASSOCIATION), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
        }),
    },
  },
});
