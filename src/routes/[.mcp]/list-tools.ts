import { createFileRoute } from "@tanstack/react-router";
import { createTanStackListToolsHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import { IS_DEMO_MODE } from "@/config/app-mode";
import { demoDisabledMcpHandler } from "@/lib/mcp/demo-guard";
import mcp from "../../lib/mcp/index";

export const Route = createFileRoute("/.mcp/list-tools")({
  server: {
    handlers: {
      ANY: IS_DEMO_MODE
        ? demoDisabledMcpHandler
        : createTanStackListToolsHandler(mcp, {
            resourcePath: "/mcp",
            metadataPath: "/.well-known/oauth-protected-resource",
            trustForwardedHost: true,
          }),
    },
  },
});
