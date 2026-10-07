import { describe, expect, test } from "bun:test";
import {
  approvalOperationLabel,
  approvalOperationRole,
  approvalStatusLabel,
  auditOutcomeLabel,
  executionStatusLabel,
  formatAuditTimestamp,
  NO_REVOCATION_REQUESTED,
  pendingCountLabel,
  REVOCATION_QUEUE_LABELS,
  revocationRequestStatusLabel,
} from "./admin-labels";
import {
  ADMIN_REFUSAL_TEXT,
  describeAdminRefusal,
  isRecentAuthRefusal,
  refusedWith,
  screenNoticeFor,
} from "./admin-refusal";
import { arrivalStatus, DASHBOARD_TILE_LINKS, statTileLink } from "./dashboard-links";
import { CONFIRMED_MOVES, editorialMoveCopy, moveNeedsDialog } from "./editorial-move";
import {
  adminApprovalExecutionStatusSchema,
  adminApprovalStatusSchema,
} from "@/backend/admin/contracts";
import { revocationRequestStatusSchema } from "@/backend/admin/control-plane-contracts";
import { ADMIN_USER_STATUSES } from "@/backend/admin/users-contracts";
import { EDITORIAL_STATUSES } from "@/backend/news/contracts";

const ARABIC = /[؀-ۿ]/;
const MACHINE = /^[a-z]+(_[a-z]+)+$|^[a-z]+\.[a-z_]+$/;

describe("the security console says its states in words", () => {
  test("every approval, execution and revocation state has a French and an Arabic label", () => {
    const cases: [string, (value: string, lang: "fr" | "ar") => string, readonly string[]][] = [
      ["approval", approvalStatusLabel, adminApprovalStatusSchema.options],
      ["execution", executionStatusLabel, adminApprovalExecutionStatusSchema.options],
      ["revocation", revocationRequestStatusLabel, revocationRequestStatusSchema.options],
      ["audit", auditOutcomeLabel, ["succeeded", "denied", "failed"]],
    ];
    for (const [kind, label, values] of cases) {
      for (const value of values) {
        const fr = label(value, "fr");
        const ar = label(value, "ar");
        expect({ kind, value, raw: fr === value || ar === value }).toEqual({
          kind,
          value,
          raw: false,
        });
        expect({ kind, value, arabic: ARABIC.test(ar) }).toEqual({ kind, value, arabic: true });
      }
    }
    expect(approvalStatusLabel("pending", "fr")).toBe("En attente");
    expect(executionStatusLabel("not_started", "fr")).toBe("Pas encore exécutée");
  });

  test("an unknown value is shown as it came, never dropped", () => {
    expect(approvalStatusLabel("brand_new_state", "fr")).toBe("brand_new_state");
    expect(approvalOperationLabel("staff.something_new", "ar")).toBe("staff.something_new");
    expect(approvalOperationRole("staff.something_new", "fr")).toBeNull();
  });

  test("names the operation and the role the platform-admin request grants", () => {
    expect(approvalOperationLabel("staff.assign_platform_admin", "fr")).toBe(
      "Attribution du rôle administrateur de la plateforme",
    );
    expect(approvalOperationRole("staff.assign_platform_admin", "fr")).toBe(
      "administrateur de la plateforme",
    );
    expect(approvalOperationRole("staff.assign_platform_admin", "ar")).toBe("مدير المنصة");
  });

  test("the invalidation queue's counters are words, not 'Queued' or 'Dead-letter'", () => {
    for (const labels of Object.values(REVOCATION_QUEUE_LABELS)) {
      expect(labels.fr).not.toMatch(/Queued|Processing|Retry|Dead-letter/);
      expect(labels.ar).toMatch(ARABIC);
    }
    expect(pendingCountLabel(2, "fr")).toBe("2 en attente");
    expect(pendingCountLabel(2, "ar")).toMatch(ARABIC);
    expect(NO_REVOCATION_REQUESTED.fr).not.toContain("not_requested");
  });

  test("audit times are Morocco time, to the second, with Latin digits in Arabic", () => {
    // From 2026-09-20 Morocco keeps UTC+0 all year (`morocco-time.ts`).
    const fr = formatAuditTimestamp("2026-10-06T21:14:03.123+00:00", "fr");
    expect(fr).toContain("21:14:03");
    expect(fr).toContain("2026");
    expect(fr).not.toContain("T21");
    const ar = formatAuditTimestamp("2026-10-06T21:14:03.123+00:00", "ar");
    expect(ar).toContain("21:14:03");
    expect(ar).not.toMatch(/[٠-٩]/);
    // Before the change Morocco was UTC+1: 12:00 UTC read 13:00 there.
    expect(formatAuditTimestamp("2026-01-15T12:00:00+00:00", "fr")).toContain("13:00:00");
    // Unreadable input is not hidden.
    expect(formatAuditTimestamp("not-a-date", "fr")).toBe("not-a-date");
  });
});

describe("refusals in words", () => {
  test("the 15-minute rule asks for a sign-in, not a sign-out and a sign-in", () => {
    expect(isRecentAuthRefusal("recent_auth_required")).toBe(true);
    expect(isRecentAuthRefusal("permission_missing")).toBe(false);
    expect(isRecentAuthRefusal(null)).toBe(false);
    const fr = describeAdminRefusal("recent_auth_required", "fr");
    expect(fr).toContain("15 minutes");
    expect(fr).toContain("Reconnectez-vous");
    expect(fr).not.toContain("Déconnectez-vous");
    expect(describeAdminRefusal("recent_auth_required", "ar")).not.toContain("سجّل الخروج");
  });

  test("under a confirm step, the screen does not repeat the stale sign-in prompt", () => {
    // The prompt with "Se reconnecter" sits under the action; a second copy
    // in the screen's notice read as two errors.
    expect(screenNoticeFor("recent_auth_required", "…")).toBeNull();
    expect(screenNoticeFor("permission_missing", "Votre rôle ne permet pas cette action.")).toBe(
      "Votre rôle ne permet pas cette action.",
    );
  });

  test("every known refusal is a sentence in both languages, not a code", () => {
    for (const [code, text] of Object.entries(ADMIN_REFUSAL_TEXT)) {
      expect({ code, fr: MACHINE.test(text.fr) }).toEqual({ code, fr: false });
      expect({ code, ar: ARABIC.test(text.ar) }).toEqual({ code, ar: true });
    }
  });

  test("an unknown refusal keeps its code as a reference after a sentence", () => {
    expect(describeAdminRefusal("brand_new_code", "fr")).toBe(
      "L’opération n’a pas pu aboutir (réf. : brand_new_code).",
    );
    expect(describeAdminRefusal("brand_new_code", "ar")).toContain("brand_new_code");
  });

  test("a refusal is reported to the confirm step with its code", () => {
    expect(refusedWith("recent_auth_required")).toEqual({ refused: "recent_auth_required" });
  });
});

describe("dashboard tiles that open their list", () => {
  test("link only for staff whose role opens the list", () => {
    expect(statTileLink(DASHBOARD_TILE_LINKS.banned, ["users.read_support"])).toEqual(
      DASHBOARD_TILE_LINKS.banned,
    );
    expect(statTileLink(DASHBOARD_TILE_LINKS.banned, ["analytics.read"])).toBeNull();
    expect(statTileLink(DASHBOARD_TILE_LINKS.published, ["editorial.read"])).not.toBeNull();
    expect(statTileLink(DASHBOARD_TILE_LINKS.published, ["users.read_support"])).toBeNull();
  });

  test("open the lists on filters those lists already have", () => {
    expect(DASHBOARD_TILE_LINKS.banned).toMatchObject({
      to: "/admin/users",
      search: { status: "banned" },
    });
    expect(ADMIN_USER_STATUSES).toContain(DASHBOARD_TILE_LINKS.banned.search.status);
    expect(DASHBOARD_TILE_LINKS.published).toMatchObject({
      to: "/admin/news",
      search: { status: "published" },
    });
    expect(EDITORIAL_STATUSES).toContain(DASHBOARD_TILE_LINKS.published.search.status);
  });

  test("a list reads only a status it knows from the address", () => {
    expect(arrivalStatus("banned", ADMIN_USER_STATUSES)).toBe("banned");
    expect(arrivalStatus("published", EDITORIAL_STATUSES)).toBe("published");
    expect(arrivalStatus("drop table", ADMIN_USER_STATUSES)).toBeUndefined();
    expect(arrivalStatus(1, ADMIN_USER_STATUSES)).toBeUndefined();
    expect(arrivalStatus(undefined, EDITORIAL_STATUSES)).toBeUndefined();
  });
});

describe("the article editor's status confirmation", () => {
  const base = { current: "in_review", articleLanguage: "fr", lang: "fr" } as const;

  test("Publier, Dépublier, Archiver and Refuser always ask first", () => {
    expect([...CONFIRMED_MOVES].sort()).toEqual(
      ["archived", "published", "rejected", "unpublished"].sort(),
    );
    for (const move of CONFIRMED_MOVES) expect(moveNeedsDialog(move, false)).toBe(true);
    for (const move of ["in_review", "draft", "scheduled"] as const) {
      expect(moveNeedsDialog(move, false)).toBe(false);
      // ...unless there are unsaved edits: then every move asks.
      expect(moveNeedsDialog(move, true)).toBe(true);
    }
  });

  test("says where a published article appears, and that an unpublished one disappears", () => {
    const publish = editorialMoveCopy({
      ...base,
      target: "published",
      dirty: false,
      moveLabel: "Publier",
    });
    expect(publish.title).toBe("Publier l’article ?");
    expect(publish.description).toContain("Actualités en français");
    expect(publish.commit).toBe("Publier");
    expect(publish.unsavedNote).toBeNull();

    const arabicEdition = editorialMoveCopy({
      ...base,
      articleLanguage: "ar",
      target: "published",
      dirty: false,
      moveLabel: "Publier",
    });
    expect(arabicEdition.description).toContain("en arabe");

    const unpublish = editorialMoveCopy({
      ...base,
      current: "published",
      target: "unpublished",
      dirty: false,
      moveLabel: "Dépublier",
    });
    expect(unpublish.description).toContain("disparaîtra du site");
  });

  test("with unsaved edits, offers to save then move -- never the stale text", () => {
    const copy = editorialMoveCopy({
      ...base,
      target: "published",
      dirty: true,
      moveLabel: "Publier",
    });
    expect(copy.commit).toBe("Enregistrer et publier");
    expect(copy.unsavedNote).toContain("enregistrées d’abord");
    const review = editorialMoveCopy({
      ...base,
      current: "draft",
      target: "in_review",
      dirty: true,
      moveLabel: "Envoyer en relecture",
    });
    expect(review.commit).toBe("Enregistrer et envoyer en relecture");
    expect(review.title).toBe("Modifications non enregistrées");
  });

  test("every message exists in Arabic", () => {
    for (const target of EDITORIAL_STATUSES) {
      for (const dirty of [false, true]) {
        if (!moveNeedsDialog(target, dirty)) continue;
        const copy = editorialMoveCopy({ ...base, lang: "ar", target, dirty, moveLabel: "نشر" });
        for (const text of [copy.title, copy.description, copy.commit, copy.abandon]) {
          expect({ target, dirty, arabic: ARABIC.test(text) }).toEqual({
            target,
            dirty,
            arabic: true,
          });
        }
      }
    }
  });
});
