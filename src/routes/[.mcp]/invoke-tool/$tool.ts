import { createFileRoute } from "@tanstack/react-router";
import { createTanStackInvokeToolHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import { IS_DEMO_MODE } from "@/config/app-mode";
import { demoDisabledMcpHandler } from "@/lib/mcp/demo-guard";
import mcp from "../../../lib/mcp/index";

export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
  server: {
    handlers: {
      ANY: IS_DEMO_MODE
        ? demoDisabledMcpHandler
        : createTanStackInvokeToolHandler(mcp, {
            resourcePath: "/mcp",
            metadataPath: "/.well-known/oauth-protected-resource",
            trustForwardedHost: true,
          }),
    },
  },
});
