// @ts-nocheck
import { describe, it, expect, beforeEach } from "bun:test";
import "./__test-shim";
import { importDecisionService, isImportPromptEligible } from "./fantasy-import-decision";

beforeEach(() => {
  importDecisionService.__resetForDev();
});

describe("importDecisionService — per-UID markers", () => {
  it("returns null when no decision recorded", () => {
    expect(importDecisionService.get("u1")).toBeNull();
  });

  it("markImported / markStartNew persist per UID", () => {
    importDecisionService.markImported("u1");
    importDecisionService.markStartNew("u2");
    expect(importDecisionService.get("u1")).toBe("imported");
    expect(importDecisionService.get("u2")).toBe("start_new");
  });

  it("does NOT set a marker for empty UID", () => {
    importDecisionService.markImported("");
    expect(importDecisionService.get("")).toBeNull();
  });

  it("__resetForDev clears one UID without touching others", () => {
    importDecisionService.markImported("u1");
    importDecisionService.markImported("u2");
    importDecisionService.__resetForDev("u1");
    expect(importDecisionService.get("u1")).toBeNull();
    expect(importDecisionService.get("u2")).toBe("imported");
  });
});

describe("isImportPromptEligible — full matrix", () => {
  const base = {
    authMode: "supabase" as const,
    isAuthenticated: true,
    uid: "u1",
    emptyCloudSquad: true,
    localSquadSize: 15,
    localTeamValid: true,
  };

  it("eligible when all conditions hold", () => {
    expect(isImportPromptEligible(base)).toBe(true);
  });

  it("NOT eligible in mock auth mode", () => {
    expect(isImportPromptEligible({ ...base, authMode: "mock" as const })).toBe(false);
  });

  it("NOT eligible when unauthenticated", () => {
    expect(isImportPromptEligible({ ...base, isAuthenticated: false })).toBe(false);
  });

  it("NOT eligible when uid missing", () => {
    expect(isImportPromptEligible({ ...base, uid: null })).toBe(false);
  });

  it("NOT eligible when cloud squad already exists", () => {
    expect(isImportPromptEligible({ ...base, emptyCloudSquad: false })).toBe(false);
  });

  it("NOT eligible when local squad is incomplete", () => {
    expect(isImportPromptEligible({ ...base, localSquadSize: 11 })).toBe(false);
  });

  it("NOT eligible when local squad is invalid", () => {
    expect(isImportPromptEligible({ ...base, localTeamValid: false })).toBe(false);
  });

  it("NOT eligible after markImported()", () => {
    importDecisionService.markImported("u1");
    expect(isImportPromptEligible(base)).toBe(false);
  });

  it("NOT eligible after markStartNew()", () => {
    importDecisionService.markStartNew("u1");
    expect(isImportPromptEligible(base)).toBe(false);
  });

  it("still eligible when u2 has a marker but u1 does not (UID isolation)", () => {
    importDecisionService.markImported("u2");
    expect(isImportPromptEligible(base)).toBe(true);
  });

  it("`Plus tard` semantics — never persist a marker so prompt returns", () => {
    // Simulate: user clicks Later → we do NOT call any mark* method.
    expect(isImportPromptEligible(base)).toBe(true);
    expect(importDecisionService.get("u1")).toBeNull();
  });

  it("failed import must NOT set a marker", () => {
    // Simulate failure path: we never call markImported. Eligibility remains.
    expect(importDecisionService.get("u1")).toBeNull();
    expect(isImportPromptEligible(base)).toBe(true);
  });
});
