import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getProfile from "./tools/get-profile";
import getFantasyTeam from "./tools/get-fantasy-team";
import listFixtures from "./tools/list-fixtures";

// Use the direct Supabase issuer host (not the .lovable.cloud proxy) so mcp-js
// discovery matches the token issuer.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "botolago-mcp",
  title: "BotolaGO",
  version: "0.1.0",
  instructions:
    "Tools for BotolaGO — the Moroccan football + fantasy app. Use `get_profile` for the signed-in user's profile, `get_fantasy_team` for their fantasy squad summary, and `list_fixtures` for upcoming Botola Pro matches.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getProfile, getFantasyTeam, listFixtures],
});
