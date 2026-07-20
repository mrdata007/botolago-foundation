import { z } from "zod";
import { FIXTURE_STATUSES, FOOTBALL_POSITIONS } from "../contracts";

export const freshnessSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }),
  sourceSequence: z.number().int().nonnegative(),
  sourceVersion: z.string().min(1).max(160).nullable(),
  provisional: z.boolean(),
});

const identity = {
  externalId: z.string().trim().min(1).max(200),
  freshness: freshnessSchema,
};

export const providerCompetitionSchema = z.object({
  ...identity,
  name: z.string().trim().min(2).max(160),
  shortName: z.string().trim().min(1).max(40).nullable(),
  type: z.enum(["league", "cup", "super_cup", "international", "friendly"]),
  countryCode: z.string().length(2).nullable(),
});

export const providerTeamSchema = z.object({
  ...identity,
  name: z.string().trim().min(2).max(160),
  shortName: z.string().trim().min(1).max(40),
  code: z
    .string()
    .regex(/^[A-Z0-9]{2,8}$/)
    .nullable(),
  countryCode: z.string().length(2).nullable(),
});

export const providerPlayerSchema = z.object({
  ...identity,
  displayName: z.string().trim().min(2).max(120),
  fullName: z.string().trim().min(2).max(200),
  position: z.enum(FOOTBALL_POSITIONS),
  dateOfBirth: z.string().date().nullable(),
  nationalityCode: z.string().length(2).nullable(),
});

export const providerFixtureSchema = z
  .object({
    ...identity,
    competitionExternalId: z.string().min(1).max(200),
    seasonExternalId: z.string().min(1).max(200),
    roundExternalId: z.string().min(1).max(200).nullable(),
    homeTeamExternalId: z.string().min(1).max(200),
    awayTeamExternalId: z.string().min(1).max(200),
    venueExternalId: z.string().min(1).max(200).nullable(),
    kickoffAt: z.string().datetime({ offset: true }),
    status: z.enum(FIXTURE_STATUSES),
    period: z.enum([
      "pre_match",
      "first_half",
      "half_time",
      "second_half",
      "extra_time",
      "penalties",
      "post_match",
    ]),
    minute: z.number().int().min(0).max(180).nullable(),
    addedTime: z.number().int().min(0).max(60).nullable(),
    homeScore: z.number().int().nonnegative().nullable(),
    awayScore: z.number().int().nonnegative().nullable(),
  })
  .superRefine((fixture, context) => {
    if (fixture.homeTeamExternalId === fixture.awayTeamExternalId) {
      context.addIssue({ code: "custom", message: "Home and away teams must differ." });
    }
    if ((fixture.homeScore === null) !== (fixture.awayScore === null)) {
      context.addIssue({ code: "custom", message: "Scores must be supplied as a pair." });
    }
  });

export const providerPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().min(1).nullable(),
    rateLimit: z.object({
      limit: z.number().int().nonnegative().nullable(),
      remaining: z.number().int().nonnegative().nullable(),
      resetsAt: z.string().datetime({ offset: true }).nullable(),
      retryAfterMs: z.number().int().nonnegative().nullable(),
    }),
  });
