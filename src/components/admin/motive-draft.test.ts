import { describe, expect, test } from "bun:test";
import {
  clearMotiveDraft,
  markMotiveDraftForResume,
  MOTIVE_DRAFT_STORAGE_KEY,
  readMotiveDraft,
  saveMotiveDraft,
  takeResumableMotiveDraft,
  type DraftStorage,
} from "./motive-draft";

/** A plain in-memory `sessionStorage`, so the draft rules run without a DOM. */
function memoryStorage(): DraftStorage & { raw(): string | null } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    raw: () => values.get(MOTIVE_DRAFT_STORAGE_KEY) ?? null,
  };
}

const USER_A = "/admin/users/11111111-1111-4111-8111-111111111111";
const USER_B = "/admin/users/22222222-2222-4222-8222-222222222222";
const MOTIVE = "Insultes répétées dans les ligues";

describe("the motive draft of a sensitive Admin action", () => {
  test("keeps what was typed for one action on one page", () => {
    const storage = memoryStorage();
    saveMotiveDraft(USER_A, "ban:a", MOTIVE, storage);
    expect(readMotiveDraft(USER_A, "ban:a", storage)).toBe(MOTIVE);
  });

  test("never gives a motive to another action, another row or another page", () => {
    // The rule `destructive-action.ts` enforces in memory, kept in storage:
    // a motive written about one object cannot reach another.
    const storage = memoryStorage();
    saveMotiveDraft(USER_A, "ban:a", MOTIVE, storage);
    expect(readMotiveDraft(USER_A, "unban:a", storage)).toBeNull();
    expect(readMotiveDraft(USER_A, "ban:b", storage)).toBeNull();
    expect(readMotiveDraft(USER_B, "ban:a", storage)).toBeNull();
    expect(takeResumableMotiveDraft(USER_B, "ban:a", storage)).toBeNull();
  });

  test("re-opens the refused action once after 'Se reconnecter', then only prefills", () => {
    const storage = memoryStorage();
    saveMotiveDraft(USER_A, "ban:a", MOTIVE, storage);
    // Not marked: coming back to the page re-opens nothing on its own.
    expect(takeResumableMotiveDraft(USER_A, "ban:a", storage)).toBeNull();

    markMotiveDraftForResume(USER_A, storage);
    expect(takeResumableMotiveDraft(USER_A, "ban:a", storage)).toBe(MOTIVE);
    // Taken once: a second mount does not re-arm it again...
    expect(takeResumableMotiveDraft(USER_A, "ban:a", storage)).toBeNull();
    // ...but the motive itself is still there for the next press.
    expect(readMotiveDraft(USER_A, "ban:a", storage)).toBe(MOTIVE);
  });

  test("'Se reconnecter' on another page does not mark this page's draft", () => {
    const storage = memoryStorage();
    saveMotiveDraft(USER_A, "ban:a", MOTIVE, storage);
    markMotiveDraftForResume(USER_B, storage);
    expect(takeResumableMotiveDraft(USER_A, "ban:a", storage)).toBeNull();
  });

  test("is cleared by success or 'Abandonner', and by emptying the field", () => {
    const storage = memoryStorage();
    saveMotiveDraft(USER_A, "ban:a", MOTIVE, storage);
    clearMotiveDraft(USER_A, "ban:a", storage);
    expect(storage.raw()).toBeNull();

    saveMotiveDraft(USER_A, "ban:a", MOTIVE, storage);
    saveMotiveDraft(USER_A, "ban:a", "   ", storage);
    expect(storage.raw()).toBeNull();
  });

  test("clearing one action leaves another action's draft alone", () => {
    const storage = memoryStorage();
    saveMotiveDraft(USER_A, "ban:a", MOTIVE, storage);
    clearMotiveDraft(USER_A, "unban:a", storage);
    expect(readMotiveDraft(USER_A, "ban:a", storage)).toBe(MOTIVE);
  });

  test("keeps one draft at a time: typing for a new action replaces the old one", () => {
    const storage = memoryStorage();
    saveMotiveDraft(USER_A, "ban:a", MOTIVE, storage);
    saveMotiveDraft(USER_A, "approve:x", "Demande vérifiée par téléphone", storage);
    expect(readMotiveDraft(USER_A, "ban:a", storage)).toBeNull();
    expect(readMotiveDraft(USER_A, "approve:x", storage)).toBe("Demande vérifiée par téléphone");
  });

  test("never throws: no storage, blocked storage or a corrupt value read as no draft", () => {
    expect(readMotiveDraft(USER_A, "ban:a", null)).toBeNull();
    expect(() => saveMotiveDraft(USER_A, "ban:a", MOTIVE, null)).not.toThrow();

    const blocked: DraftStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => saveMotiveDraft(USER_A, "ban:a", MOTIVE, blocked)).not.toThrow();
    expect(readMotiveDraft(USER_A, "ban:a", blocked)).toBeNull();
    expect(() => markMotiveDraftForResume(USER_A, blocked)).not.toThrow();

    const corrupt = memoryStorage();
    corrupt.setItem(MOTIVE_DRAFT_STORAGE_KEY, "{not json");
    expect(readMotiveDraft(USER_A, "ban:a", corrupt)).toBeNull();
    corrupt.setItem(MOTIVE_DRAFT_STORAGE_KEY, JSON.stringify({ path: USER_A }));
    expect(readMotiveDraft(USER_A, "ban:a", corrupt)).toBeNull();
  });
});
