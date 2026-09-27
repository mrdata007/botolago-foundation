import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

import { getPepitesApi, supabaseV2 } from "@/integrations/supabase/v2-client";

import { pepitesPlayerCardSchema } from "./contracts";

/**
 * The Pépites staff screens' calls (`api.admin_pepites_*`, the data desk and
 * the photo releases). Every one runs the step-up and a permission check in
 * the database; the screens only reflect what it answers.
 */

const nullableString = z.string().nullable();

export const adminEditionSummarySchema = z.object({
  id: z.string().uuid(),
  week: z.number().int(),
  round: z.number().int(),
  status: z.enum(["draft", "scheduled", "published", "superseded", "withdrawn"]),
  scheduledFor: nullableString,
  publishedAt: nullableString,
  correctsEditionId: z.string().uuid().nullable(),
  problems: z.array(z.string()),
});

export const adminOverviewSchema = z.object({
  settings: z
    .object({
      mode: z.enum(["off", "staff", "public"]),
      autoPublish: z.boolean(),
      publishLocalTime: z.string(),
      draftLocalTime: z.string(),
    })
    .nullable(),
  jobActive: z.boolean(),
  season: z.object({ id: z.string().uuid(), label: z.string() }).nullable(),
  pointer: z.record(z.string(), z.unknown()).nullable(),
  runs: z.array(
    z.object({
      id: z.string().uuid(),
      kind: z.string(),
      round: z.number().int(),
      revision: z.number().int(),
      status: z.string(),
      eligible: z.number().int().nullable(),
      ranked: z.number().int().nullable(),
      activatedAt: nullableString,
      finishedAt: nullableString,
      error: nullableString,
    }),
  ),
  editions: z.array(adminEditionSummarySchema),
  notices: z.array(z.object({ subject: z.string(), body: z.string(), sentAt: z.string() })),
});

const shortlistPlayerSchema = pepitesPlayerCardSchema.extend({
  minutes: z.number().int(),
  goals: z.number().int(),
  assists: z.number().int(),
  ratingAvg: z.number().nullable(),
  flags: z.array(z.string()),
});

export const adminEditionSchema = z.object({
  edition: z.object({
    id: z.string().uuid(),
    seasonId: z.string().uuid(),
    week: z.number().int(),
    round: z.number().int(),
    status: adminEditionSummarySchema.shape.status,
    runId: z.string().uuid(),
    scheduledFor: nullableString,
    publishedAt: nullableString,
    correctsEditionId: z.string().uuid().nullable(),
    supersededBy: z.string().uuid().nullable(),
    withdrawnReason: nullableString,
  }),
  problems: z.array(z.string()),
  entries: z.array(
    z.object({
      rank: z.number().int(),
      computedRank: z.number().int(),
      computedScore: z.number(),
      reasonFr: nullableString,
      reasonAr: nullableString,
      player: pepitesPlayerCardSchema,
    }),
  ),
  shortlist: z.array(shortlistPlayerSchema),
  moves: z.array(
    z.object({
      from: nullableString,
      to: z.string(),
      actorKind: z.string(),
      at: z.string(),
      detail: z.unknown(),
    }),
  ),
});

export const emailReportSchema = z.object({
  editionId: z.string().uuid(),
  event: z
    .object({ status: z.string(), occurredAt: z.string(), errorCode: nullableString })
    .nullable(),
  total: z.number(),
  queued: z.number(),
  sent: z.number(),
  deferred: z.number(),
  expired: z.number(),
  possiblySent: z.number(),
  failed: z.number(),
  cancelled: z.record(z.string(), z.number()),
});

export const dataDeskIssueSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  field: z.string(),
  kind: z.enum(["missing", "conflict", "reported", "unlinked"]),
  status: z.enum(["open", "resolved", "dismissed"]),
  source: z.string(),
  details: z.unknown(),
  playerName: nullableString,
  createdAt: z.string(),
  resolvedAt: nullableString,
  resolutionNote: nullableString,
});

export const dataDeskPageSchema = z.object({
  total: z.number().int(),
  issues: z.array(dataDeskIssueSchema),
});

export const photoReleaseSchema = z.object({
  id: z.string().uuid(),
  playerId: z.string().uuid(),
  playerName: z.string(),
  status: z.string(),
  scope: z.enum(["in_app", "in_app_and_social"]),
  signerRole: z.enum(["player", "guardian"]),
  licenceCode: z.string(),
  credit: z.string(),
  copyrightOwner: z.string(),
  capturedOn: z.string(),
  signedOn: z.string(),
  expiresOn: nullableString,
  submittedAt: z.string(),
  submittedByMe: z.boolean(),
  approvedAt: nullableString,
  publishedAt: nullableString,
  endedAt: nullableString,
  endReason: nullableString,
  problems: z.array(z.string()),
});

export const adminPlayerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  fullName: z.string(),
  dateOfBirth: nullableString,
  nationality: nullableString,
  preferredFoot: nullableString,
  heightCm: z.number().nullable(),
  detailedPosition: nullableString,
  hasPhoto: z.boolean(),
  team: nullableString,
});

export type AdminOverview = z.infer<typeof adminOverviewSchema>;
export type AdminEditionSummary = z.infer<typeof adminEditionSummarySchema>;
export type AdminEdition = z.infer<typeof adminEditionSchema>;
export type EmailReport = z.infer<typeof emailReportSchema>;
export type DataDeskIssue = z.infer<typeof dataDeskIssueSchema>;
export type DataDeskPage = z.infer<typeof dataDeskPageSchema>;
export type PhotoRelease = z.infer<typeof photoReleaseSchema>;
export type AdminPlayer = z.infer<typeof adminPlayerSchema>;

export interface EditionEntryInput {
  readonly playerId: string;
  readonly rank: number;
  readonly reasonFr: string | null;
  readonly reasonAr: string | null;
}

export const CORRECTABLE_ATTRIBUTES = [
  "date_of_birth",
  "nationality",
  "preferred_foot",
  "height_cm",
  "detailed_position",
] as const;
export type CorrectableAttribute = (typeof CORRECTABLE_ATTRIBUTES)[number];

/** A refusal from the database, with its code and message kept for the screen. */
export class PepitesAdminError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PepitesAdminError";
  }
}

type RpcResult = { data: unknown; error: PostgrestError | null };

async function call<T>(
  request: PromiseLike<RpcResult>,
  schema: { parse(value: unknown): T },
): Promise<T> {
  const response = await request;
  if (response.error) {
    throw new PepitesAdminError(response.error.code ?? "unknown", response.error.message ?? "");
  }
  try {
    return schema.parse(response.data);
  } catch {
    throw new PepitesAdminError("invalid_response", "The Pépites admin API answered unexpectedly.");
  }
}

const anything = { parse: (value: unknown) => value };

// The generated types know these functions; the screens pass plain JSON.
type LooseRpc = (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
function rpc(): LooseRpc {
  const api = getPepitesApi() as unknown as { rpc: LooseRpc };
  return (name, args) => api.rpc(name, args);
}

export const pepitesAdmin = {
  overview: () => call(rpc()("admin_pepites_overview"), adminOverviewSchema),
  edition: (editionId: string) =>
    call(rpc()("admin_pepites_edition_get", { p_edition_id: editionId }), adminEditionSchema),
  saveEntries: (editionId: string, entries: readonly EditionEntryInput[]) =>
    call(
      rpc()("admin_pepites_edition_update", { p_edition_id: editionId, p_entries: entries }),
      anything,
    ),
  schedule: (editionId: string, at: string) =>
    call(rpc()("admin_pepites_edition_schedule", { p_edition_id: editionId, p_at: at }), anything),
  unschedule: (editionId: string) =>
    call(rpc()("admin_pepites_edition_unschedule", { p_edition_id: editionId }), anything),
  publishNow: (editionId: string) =>
    call(rpc()("admin_pepites_edition_publish_now", { p_edition_id: editionId }), anything),
  correct: (editionId: string) =>
    call(
      rpc()("admin_pepites_edition_correct", { p_edition_id: editionId }),
      z.object({ editionId: z.string().uuid() }),
    ),
  withdraw: (editionId: string, reason: string) =>
    call(
      rpc()("admin_pepites_edition_withdraw", { p_edition_id: editionId, p_reason: reason }),
      anything,
    ),
  emailReport: (editionId: string) =>
    call(rpc()("admin_pepites_email_report", { p_edition_id: editionId }), emailReportSchema),
  dataDesk: (filters: { status: string; kind: string | null; offset: number }) =>
    call(
      rpc()("admin_data_desk_list", {
        p_filters: {
          status: filters.status,
          ...(filters.kind ? { kind: filters.kind } : {}),
          limit: 50,
          offset: filters.offset,
        },
      }),
      dataDeskPageSchema,
    ),
  closeIssue: (issueId: string, status: "resolved" | "dismissed", note: string) =>
    call(
      rpc()("admin_data_desk_close", { p_issue_id: issueId, p_status: status, p_note: note }),
      anything,
    ),
  correctAttribute: (
    playerId: string,
    attribute: CorrectableAttribute,
    value: string,
    sourceNote: string,
  ) =>
    call(
      rpc()("admin_player_attribute_correct", {
        p_player_id: playerId,
        p_attribute: attribute,
        p_value: value,
        p_source_note: sourceNote,
      }),
      anything,
    ),
  searchPlayers: (query: string) =>
    call(rpc()("admin_pepites_player_search", { p_query: query }), z.array(adminPlayerSchema)),
  photoReleases: (status: string) =>
    call(rpc()("admin_player_photo_releases", { p_status: status }), z.array(photoReleaseSchema)),
  approvePhoto: (releaseId: string) =>
    call(rpc()("admin_player_photo_approve", { p_release_id: releaseId }), anything),
  rejectPhoto: (releaseId: string, reason: string) =>
    call(
      rpc()("admin_player_photo_reject", { p_release_id: releaseId, p_reason: reason }),
      anything,
    ),
  revokePhoto: (releaseId: string, reason: string) =>
    call(
      rpc()("admin_player_photo_revoke", { p_release_id: releaseId, p_reason: reason }),
      anything,
    ),
  /**
   * The photo and its signed release, through the `player-photo-upload`
   * function (the buckets are private); the release starts pending.
   */
  async uploadPhoto(form: FormData): Promise<{ releaseId: string }> {
    const { data: session } = await supabaseV2.auth.getSession();
    const token = session.session?.access_token;
    if (!token) throw new PepitesAdminError("no_session", "Sign in again.");
    const { data, error } = await supabaseV2.functions.invoke("player-photo-upload", {
      body: form,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) {
      let code = "upload_failed";
      try {
        const body = (await (error as { context?: Response }).context?.json()) as {
          error?: string;
          message?: string | null;
        };
        code = body?.message ?? body?.error ?? code;
      } catch {
        // The code above stays.
      }
      throw new PepitesAdminError(code, code);
    }
    const releaseId = (data as { releaseId?: unknown } | null)?.releaseId;
    if (typeof releaseId !== "string")
      throw new PepitesAdminError("upload_failed", "No release id.");
    return { releaseId };
  },
};
