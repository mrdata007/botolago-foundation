export type AppMode = "development" | "live" | "demo";

export interface AppModeInput {
  readonly appMode?: string;
  readonly production: boolean;
  readonly authMode?: string;
  readonly footballMode?: string;
  readonly newsMode?: string;
  readonly notificationsMode?: string;
  readonly fantasyMode?: string;
  readonly supabaseProjectId?: string;
  readonly supabaseUrl?: string;
}

const browserModes = [
  ["VITE_AUTH_MODE", "authMode"],
  ["VITE_FOOTBALL_DATA_MODE", "footballMode"],
  ["VITE_NEWS_DATA_MODE", "newsMode"],
  ["VITE_NOTIFICATIONS_DATA_MODE", "notificationsMode"],
  ["VITE_FANTASY_DATA_MODE", "fantasyMode"],
] as const;

function normalized(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}

function invalidModeNames(input: AppModeInput, required: "mock" | "supabase"): string[] {
  return browserModes
    .filter(([, key]) => normalized(input[key]) !== required)
    .map(([name]) => name);
}

function isInertDemoUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".invalid")
    );
  } catch {
    return false;
  }
}

export function resolveAppMode(input: AppModeInput): AppMode {
  const configured = normalized(input.appMode);
  if (!configured) {
    if (input.production) {
      throw new Error("Production builds require VITE_APP_MODE=live or VITE_APP_MODE=demo.");
    }
    return "development";
  }
  if (configured !== "live" && configured !== "demo") {
    throw new Error("VITE_APP_MODE must be live or demo.");
  }

  const required = configured === "demo" ? "mock" : "supabase";
  const invalid = invalidModeNames(input, required);
  if (invalid.length > 0) {
    throw new Error(
      `${configured === "demo" ? "Demo" : "Live"} mode requires ${invalid.join(", ")}=${required}.`,
    );
  }

  if (configured === "demo") {
    const projectId = normalized(input.supabaseProjectId);
    if (projectId && projectId !== "demo" && projectId !== "local") {
      throw new Error("Demo mode refuses a non-demo VITE_SUPABASE_PROJECT_ID.");
    }
    if (input.supabaseUrl && !isInertDemoUrl(input.supabaseUrl)) {
      throw new Error("Demo mode refuses a network-capable VITE_SUPABASE_URL.");
    }
  }

  return configured;
}

export const APP_MODE = resolveAppMode({
  appMode: import.meta.env.VITE_APP_MODE,
  production: import.meta.env.PROD,
  authMode: import.meta.env.VITE_AUTH_MODE,
  footballMode: import.meta.env.VITE_FOOTBALL_DATA_MODE,
  newsMode: import.meta.env.VITE_NEWS_DATA_MODE,
  notificationsMode: import.meta.env.VITE_NOTIFICATIONS_DATA_MODE,
  fantasyMode: import.meta.env.VITE_FANTASY_DATA_MODE,
  supabaseProjectId: import.meta.env.VITE_SUPABASE_PROJECT_ID,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
});

export const IS_DEMO_MODE = APP_MODE === "demo";
export const IS_LIVE_MODE = APP_MODE === "live";
