import { describe, expect, it } from "bun:test";

import { BACKEND_ERROR_CODES } from "@/backend/errors";
import {
  FANTASY_ERROR_CODES,
  FantasyError,
  fantasyErrorToBackend,
  mapFantasyError,
} from "@/backend/fantasy/errors";
import { dictionaries } from "@/i18n/dictionaries";
import { createTeamErrorKey } from "./fantasy-create-service";
import { toRepoError } from "./fantasy-errors";

/**
 * The pilot cap (migration 20261016170000): once the season has its maximum number of managers,
 * `api.create_fantasy_team` refuses a NEW team with `PT409 fantasy_pilot_full`. The create screen
 * must show a clear reason in French and Arabic, not the generic "could not be saved".
 */

const KEY = "fantasy.create.error.pilot_full" as const;
const pilotFull = { code: "PT409", message: "fantasy_pilot_full", details: null };

describe("fantasy_pilot_full", () => {
  it("is a known Fantasy and backend error code", () => {
    expect(FANTASY_ERROR_CODES).toContain("fantasy_pilot_full");
    expect(BACKEND_ERROR_CODES).toContain("fantasy_pilot_full");
  });

  it("is read from the server's PT409 refusal, whatever else the text carries", () => {
    expect(mapFantasyError(pilotFull).code).toBe("fantasy_pilot_full");
    expect(
      mapFantasyError({ code: "PT409", message: "", details: "fantasy_pilot_full" }).code,
    ).toBe("fantasy_pilot_full");
    // It is not mistaken for the long-standing refusals it sits beside.
    expect(mapFantasyError({ code: "PT409", message: "fantasy_team_already_exists" }).code).toBe(
      "fantasy_team_already_exists",
    );
    expect(mapFantasyError({ code: "PT409", message: "fantasy_season_closed" }).code).toBe(
      "fantasy_season_closed",
    );
  });

  it("is a conflict (409) at the backend boundary, with a public message that leaks nothing", () => {
    const backend = fantasyErrorToBackend(pilotFull);
    expect(backend.code).toBe("fantasy_pilot_full");
    expect(backend.status).toBe(409);
    expect(backend.message).toBe("Registrations are full for now.");
  });

  it("reaches the create screen as pilot_full, with the server's code kept", () => {
    const repoError = toRepoError(mapFantasyError(pilotFull));
    expect(repoError.code).toBe("pilot_full");
    expect(repoError.domainCode).toBe("fantasy_pilot_full");
    expect(toRepoError(new FantasyError("fantasy_pilot_full", "x")).code).toBe("pilot_full");
    expect(createTeamErrorKey(repoError)).toBe(KEY);
  });

  it("does not change what the neighbouring refusals say", () => {
    expect(
      createTeamErrorKey(toRepoError(mapFantasyError({ message: "fantasy_season_closed" }))),
    ).toBe("fantasy.create.error.season_closed");
    expect(
      createTeamErrorKey(toRepoError(mapFantasyError({ message: "fantasy_team_already_exists" }))),
    ).toBe("fantasy.create.error.already_exists");
    expect(createTeamErrorKey({ code: "unknown" })).toBe("fantasy.create.error.generic");
  });

  it("has a French and an Arabic message, neither empty nor the generic one", () => {
    for (const language of ["fr", "ar"] as const) {
      const text = dictionaries[language][KEY];
      expect(typeof text).toBe("string");
      expect(text.trim().length).toBeGreaterThan(20);
      expect(text).not.toBe(dictionaries[language]["fantasy.create.error.generic"]);
    }
    // Plain words: it says registrations are full for now and to try later, and does not blame the
    // manager's squad.
    expect(dictionaries.fr[KEY]).toMatch(/complètes/);
    expect(dictionaries.fr[KEY]).toMatch(/plus tard/);
    expect(dictionaries.fr[KEY]).not.toMatch(/import/i);
    expect(dictionaries.ar[KEY]).toMatch(/[؀-ۿ]/);
    expect(dictionaries.ar[KEY]).toMatch(/لاحقًا/);
    // No placeholders to keep in step between the two languages.
    expect(dictionaries.fr[KEY]).not.toMatch(/\{/);
    expect(dictionaries.ar[KEY]).not.toMatch(/\{/);
  });
});
