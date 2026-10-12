import { createFileRoute } from "@tanstack/react-router";
import { androidAssetLinks, associationResponse } from "@/lib/app-links";

/**
 * /.well-known/assetlinks.json: tells Android that the BotolaGO app may open
 * botolago.com's e-mail links (App Links). 404 until the signing certificate
 * fingerprints are set in `src/lib/app-links.ts`. Android checks it when the
 * app is installed or updated.
 */
export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: {
    handlers: {
      GET: () => associationResponse(androidAssetLinks()),
    },
  },
});
