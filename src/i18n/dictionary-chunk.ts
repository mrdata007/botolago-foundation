type Dictionary = Readonly<Record<string, string>>;

function isDictionary(value: unknown, probe: string): value is Dictionary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)[probe] === "string"
  );
}

/**
 * The dictionary inside a dictionary chunk fetched by URL, or `null`.
 *
 * `import("./dictionary-ar")` hands over the module as written, with its
 * `ar` export. A retry that fetches the chunk under a URL of its own
 * (`retryable-import.ts`) gets the chunk as the bundler emitted it instead,
 * and the bundler renames a chunk's exports when other chunks import it too:
 * in the build of 2026-09-25 the module was re-exported as `n` and the
 * dictionary itself as `t`. So the dictionary is found by what it holds —
 * `probe`, a key every dictionary has — rather than by what it is called.
 */
export function dictionaryInChunk(module: unknown, probe: string): Dictionary | null {
  if (typeof module !== "object" || module === null) return null;
  const exports = Object.values(module as Record<string, unknown>);
  for (const value of exports) {
    if (isDictionary(value, probe)) return value;
  }
  for (const value of exports) {
    const inner = (value as { ar?: unknown } | null)?.ar;
    if (isDictionary(inner, probe)) return inner;
  }
  return null;
}
