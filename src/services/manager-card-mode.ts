import { BackendError } from "@/backend/errors";

export type ManagerCardDataMode = "mock" | "supabase";

/**
 * Same contract as the other domains: production reads the database or fails loudly. In
 * production any configured value other than `supabase` throws, and an unset one reads as
 * `supabase`; in development `mock` is the default, so a local server needs no database.
 */
export function selectManagerCardDataMode(
  configuredMode: string | undefined,
  production: boolean,
): ManagerCardDataMode {
  if (production && configuredMode !== undefined && configuredMode !== "supabase")
    throw new BackendError(
      "data_unavailable",
      "Production Manager Card requires VITE_MANAGER_CARD_DATA_MODE=supabase.",
      { status: 503 },
    );
  if (configuredMode === "mock" || configuredMode === "supabase") return configuredMode;
  return production ? "supabase" : "mock";
}

export function managerCardDataMode(): ManagerCardDataMode {
  return selectManagerCardDataMode(
    import.meta.env.VITE_MANAGER_CARD_DATA_MODE,
    import.meta.env.PROD,
  );
}

/**
 * True when the data is a development fixture. Statically false in a production build
 * (`import.meta.env.DEV` is replaced by `false` and the mode check is removed with it), so a
 * sample label can never reach a real manager's card.
 */
export function isManagerCardSampleData(): boolean {
  return import.meta.env.DEV === true && managerCardDataMode() === "mock";
}
