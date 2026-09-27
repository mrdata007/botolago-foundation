import { describe, expect, it } from "bun:test";

import { PepitesAdminError } from "@/backend/pepites/admin-repository";

import {
  addEntry,
  casablancaLocalToIso,
  defaultScheduleLocal,
  describeAdminError,
  entriesPayload,
  isoToCasablancaLocal,
  moveEntry,
  type DraftEntry,
} from "./admin-format";

const entry = (n: number): DraftEntry => ({
  playerId: `p${n}`,
  name: `Joueur ${n}`,
  team: null,
  computedRank: n,
  reasonFr: "",
  reasonAr: "",
});

describe("Morocco time for the schedule field", () => {
  it("reads 20:00 in Casablanca as 19:00 UTC outside Ramadan (UTC+1)", () => {
    expect(casablancaLocalToIso("2026-10-12T20:00")).toBe("2026-10-12T19:00:00.000Z");
    expect(isoToCasablancaLocal("2026-10-12T19:00:00.000Z")).toBe("2026-10-12T20:00");
  });

  it("follows the zone's own offset during Ramadan (UTC+0 in 2027)", () => {
    expect(casablancaLocalToIso("2027-02-22T20:00")).toBe("2027-02-22T20:00:00.000Z");
  });

  it("refuses what is not a date and time", () => {
    expect(casablancaLocalToIso("demain 20h")).toBeNull();
  });

  it("starts the field today at the publication time, or tomorrow once it has passed", () => {
    const morning = Date.parse("2026-10-12T08:00:00Z");
    expect(defaultScheduleLocal(morning, "20:00:00")).toBe("2026-10-12T20:00");
    const night = Date.parse("2026-10-12T21:30:00Z");
    expect(defaultScheduleLocal(night, "20:00:00")).toBe("2026-10-13T20:00");
  });
});

describe("the editor's list", () => {
  it("moves an entry and leaves the list whole at the edges", () => {
    const list = [entry(1), entry(2), entry(3)];
    expect(moveEntry(list, 2, -1).map((item) => item.playerId)).toEqual(["p1", "p3", "p2"]);
    expect(moveEntry(list, 0, -1).map((item) => item.playerId)).toEqual(["p1", "p2", "p3"]);
  });

  it("adds a player once, and never past ten", () => {
    const ten = Array.from({ length: 10 }, (_, index) => entry(index + 1));
    expect(addEntry(ten, entry(11))).toHaveLength(10);
    expect(addEntry([entry(1)], entry(1))).toHaveLength(1);
    expect(addEntry([entry(1)], entry(2))).toHaveLength(2);
  });

  it("sends ranks from 1 in the shown order, and blank lines as null", () => {
    const list = [{ ...entry(4), reasonFr: "  Buteur  ", reasonAr: "" }, entry(9)];
    expect(entriesPayload(list)).toEqual([
      { playerId: "p4", rank: 1, reasonFr: "Buteur", reasonAr: null },
      { playerId: "p9", rank: 2, reasonFr: null, reasonAr: null },
    ]);
  });
});

describe("the database's refusals, in words", () => {
  it("explains a known code and keeps it", () => {
    const error = new PepitesAdminError("PT403", "recent_auth_required");
    expect(describeAdminError(error, false)).toContain("Reconnectez-vous");
    expect(describeAdminError(error, false)).toContain("recent_auth_required");
    expect(describeAdminError(error, true)).toContain("أعد تسجيل الدخول");
  });

  it("falls back to a plain failure with the code", () => {
    expect(describeAdminError(new PepitesAdminError("XX000", "boom"), false)).toBe(
      "L'opération a échoué. (boom)",
    );
  });
});
