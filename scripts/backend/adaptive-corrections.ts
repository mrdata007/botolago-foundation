/** Service-only correction preparation. No network or database writes here.
 * The caller sends the returned document to service_record_fantasy_observation
 * with source=reviewed-correction after reviewing its evidence references. */
import { z } from "zod";
import {
  deriveParticipation,
  type FieldEvidence,
} from "../../src/backend/fantasy/adaptive-scoring";
const reference = z.string().trim().min(3).max(2000);
const evidence = z.object({
  state: z.enum(["verified", "derived", "unknown"]),
  source: z.string().trim().min(1),
  observedAt: z.iso.datetime(),
  references: z.array(reference).min(1),
});
const timeline = z.object({
  complete: z.literal(true),
  orderingVerified: z.literal(true),
  appeared: z.boolean(),
  started: z.boolean(),
  enteredAt: z.number().int().min(0).max(90).nullable(),
  exitedAt: z.number().int().min(0).max(90).nullable(),
  concededAt: z.array(z.number().min(0).max(90)),
});
export const adaptiveCorrectionSchema = z.object({
  expectedDigest: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  reason: z.string().trim().min(8).max(500),
  reviewer: z.string().trim().min(3).max(200),
  references: z.array(reference).min(1),
  homeScore: z.number().int().nonnegative(),
  awayScore: z.number().int().nonnegative(),
  anonymousStarters: z.number().int().min(0).max(4),
  anonymousByTeam: z.record(z.string().uuid(), z.number().int().min(0).max(4)),
  verifiedNonParticipants: z.array(z.string().uuid()).default([]),
  participationComplete: z.boolean(),
  disciplineComplete: z.boolean(),
  players: z
    .array(
      z.object({
        playerId: z.string().uuid(),
        teamId: z.string().uuid(),
        started: z.boolean(),
        stats: z.record(
          z.string(),
          z.union([z.number().int().nonnegative(), z.boolean(), z.null()]),
        ),
        evidence: z.record(z.string(), evidence),
        timeline: timeline.optional(),
      }),
    )
    .min(18)
    .max(100),
});
export function prepareAdaptiveCorrection(input: unknown, observedAt: string) {
  z.iso.datetime().parse(observedAt);
  const doc = adaptiveCorrectionSchema.parse(input);
  if (new Set(doc.players.map((p) => p.playerId)).size !== doc.players.length)
    throw new Error("adaptive_duplicate_identity");
  return {
    ...doc,
    players: doc.players.map(({ timeline, ...player }) => {
      if (!timeline) return player;
      if (timeline.started !== player.started) throw new Error("participation_inconsistent");
      const derived = deriveParticipation(timeline);
      // Never overwrite official minutes. The database disqualifies derived
      // minutes from full readiness, while simple uses the same 60-minute gate.
      const fields = player.evidence as FieldEvidence;
      if (fields.minutes?.state === "verified") return player;
      return {
        ...player,
        stats: { ...player.stats, ...derived },
        evidence: {
          ...player.evidence,
          ...Object.fromEntries(
            Object.keys(derived).map((field) => [
              field,
              {
                state: "derived",
                source: "reviewed-match-timeline",
                observedAt,
                references: doc.references,
              },
            ]),
          ),
        },
      };
    }),
  };
}
