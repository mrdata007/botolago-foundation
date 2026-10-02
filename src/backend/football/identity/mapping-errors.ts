import { MAPPING_ERROR_CODES, type MappingErrorCode } from "./mapping-contracts";

export class MappingError extends Error {
  constructor(
    readonly code: MappingErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "MappingError";
  }
}

/**
 * Maps a PostgREST / Postgres error to a stable code. The database raises each
 * refusal with the code as its message, so the first known code found in the
 * message wins; anything unknown is reported as unavailable, never guessed.
 * (`PT403 permission_missing` and its siblings are matched by their code.)
 */
export function mapMappingError(error: unknown): MappingError {
  if (error instanceof MappingError) return error;
  const source = error as { message?: string; details?: string; code?: string } | null;
  const text = `${source?.message ?? ""} ${source?.details ?? ""}`.toLowerCase();
  const code = MAPPING_ERROR_CODES.find((candidate) => text.includes(candidate));
  if (code)
    return new MappingError(code, `The mapping service refused the request: ${code}.`, error);
  if (`${source?.code ?? ""}`.toUpperCase() === "PT401" || `${source?.code ?? ""}` === "42501") {
    return new MappingError("staff_access_denied", "Staff access is denied.", error);
  }
  return new MappingError("mapping_unavailable", "The mapping service is unavailable.", error);
}
