import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { Database } from "@/backend/generated/database.types";
import { matchCardSchema } from "@/backend/football/contracts";

export default defineTool({
  name: "list_fixtures",
  title: "List upcoming fixtures",
  description:
    "Lists upcoming Botola Pro fixtures ordered by kickoff. Optionally limit the number of results.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max number of fixtures to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await supabase.schema("api").rpc("football_upcoming_matches", {
      p_language: "fr",
      p_limit: limit ?? 10,
    });
    if (error) {
      return {
        content: [{ type: "text", text: "Football data is temporarily unavailable." }],
        isError: true,
      };
    }
    const fixtures = z.array(matchCardSchema).safeParse(data);
    if (!fixtures.success) {
      return {
        content: [{ type: "text", text: "Football data is temporarily unavailable." }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(fixtures.data) }],
      structuredContent: { fixtures: fixtures.data },
    };
  },
});
