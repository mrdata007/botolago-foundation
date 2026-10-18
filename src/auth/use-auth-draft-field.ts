import { useEffect, useState } from "react";
import { AUTH_DRAFT_FIELDS } from "./auth-draft-storage";

type DraftField = (typeof AUTH_DRAFT_FIELDS)[number];
const MAX_AGE_MS = 30 * 60_000;

/** Keep only non-secret fields during a same-tab policy visit or history navigation. */
export function useAuthDraftField(field: DraftField) {
  const key = `botolago.auth-draft.${field}`;
  const [value, setValue] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
      if (
        saved &&
        typeof saved.value === "string" &&
        typeof saved.at === "number" &&
        Date.now() - saved.at >= 0 &&
        Date.now() - saved.at < MAX_AGE_MS
      ) {
        setValue(saved.value);
      } else {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Storage can be disabled; the form still works in memory.
    }
  }, [key]);

  const update = (next: string) => {
    setValue(next);
    try {
      if (next) window.sessionStorage.setItem(key, JSON.stringify({ value: next, at: Date.now() }));
      else window.sessionStorage.removeItem(key);
    } catch {
      // Best effort, including quota limits for junk pasted into a field.
    }
  };

  return [value, update] as const;
}
