import { createFileRoute } from "@tanstack/react-router";
import { ADVERTISING, advertisingTxt } from "@/lib/advertising";

export const Route = createFileRoute("/ads.txt")({
  server: {
    handlers: {
      GET: () => {
        const content = advertisingTxt(ADVERTISING);
        return new Response(content ?? "", {
          status: content ? 200 : 404,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
