import { createFileRoute } from "@tanstack/react-router";
import { createTanStackOAuthProtectedResourceMetadataHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import { IS_DEMO_MODE } from "@/config/app-mode";
import { demoDisabledMcpHandler } from "@/lib/mcp/demo-guard";
import mcp from "../../lib/mcp/index";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      ANY: IS_DEMO_MODE
        ? demoDisabledMcpHandler
        : createTanStackOAuthProtectedResourceMetadataHandler(mcp, {
            resourcePath: "/mcp",
            metadataPath: "/.well-known/oauth-protected-resource",
            trustForwardedHost: true,
          }),
    },
  },
});
