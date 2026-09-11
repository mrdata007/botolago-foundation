import type { FantasyRepository } from "@/backend/fantasy/contracts";
import { IS_DEMO_MODE } from "@/config/app-mode";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";

export type FantasyDataMode = "mock" | "supabase";

export function selectFantasyDataMode(
  configured: string | undefined,
  production: boolean,
  demoMode = IS_DEMO_MODE,
): FantasyDataMode {
  if (demoMode && configured !== "mock")
    throw new Error("Demo Fantasy requires VITE_FANTASY_DATA_MODE=mock.");
  if (production && !demoMode && configured !== "supabase")
    throw new Error("Production Fantasy requires VITE_FANTASY_DATA_MODE=supabase.");
  if (configured === "mock" || configured === "supabase") return configured;
  return "mock";
}

const cloudRepository = new SupabaseFantasyRepository();

export function getFantasyV2Repository(
  options: {
    readonly configuredMode?: string;
    readonly production?: boolean;
    readonly mockRepository?: FantasyRepository;
  } = {},
): FantasyRepository {
  const mode = selectFantasyDataMode(
    options.configuredMode ?? import.meta.env.VITE_FANTASY_DATA_MODE,
    options.production ?? import.meta.env.PROD,
  );
  if (mode === "supabase") return cloudRepository;
  if (!options.mockRepository)
    throw new Error("A deterministic Fantasy mock repository is required in mock mode.");
  return options.mockRepository;
}
