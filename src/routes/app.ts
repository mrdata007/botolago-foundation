import { createFileRoute } from "@tanstack/react-router";

import { appRedirectTarget } from "@/lib/app-download";

/**
 * `/app`: the address inside the download page's QR code. It sends an
 * iPhone to the App Store and an Android phone to Google Play once their
 * addresses are set (`src/lib/app-download.ts`), and anyone else, or a phone
 * whose store is not set yet, to `/telecharger`.
 *
 * The answer depends on the phone, so no shared cache may keep it.
 */
export const Route = createFileRoute("/app")({
  server: {
    handlers: {
      GET: ({ request }) =>
        new Response(null, {
          status: 302,
          headers: {
            location: appRedirectTarget(request.headers.get("user-agent")),
            "cache-control": "private, no-store",
            vary: "user-agent",
          },
        }),
    },
  },
});
