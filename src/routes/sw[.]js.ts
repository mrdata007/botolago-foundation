import { createFileRoute } from "@tanstack/react-router";
import { currentRelease } from "@/lib/operational-errors";
import { serviceWorkerSource } from "@/lib/service-worker";

/**
 * /sw.js: the service worker for this release (`@/lib/service-worker`, FE-H2).
 * Never cached, so the browser's update check always sees the deployed one.
 */
export const Route = createFileRoute("/sw.js")({
  server: {
    handlers: {
      GET: () =>
        new Response(serviceWorkerSource(currentRelease()), {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-cache",
          },
        }),
    },
  },
});
