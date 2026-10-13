import { createFileRoute } from "@tanstack/react-router";
import { appleAppSiteAssociation, associationResponse } from "@/lib/app-links";

/**
 * /.well-known/apple-app-site-association: tells iOS that the BotolaGO app
 * may open botolago.com's e-mail links (Universal Links). 404 until the Apple
 * Team ID is set in `src/lib/app-links.ts`. Apple fetches it through its own
 * CDN when the app is installed, so a change takes a while to reach phones.
 */
export const Route = createFileRoute("/.well-known/apple-app-site-association")({
  server: {
    handlers: {
      GET: () => associationResponse(appleAppSiteAssociation()),
    },
  },
});
