import { z } from "zod";

export const normalizedNewsArticleSchema = z.object({
  externalId: z.string().trim().min(1).max(250),
  canonicalUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://")),
  language: z.enum(["fr", "ar"]),
  title: z.string().trim().min(5).max(220),
  subtitle: z.string().trim().min(2).max(300).nullable(),
  summary: z.string().trim().min(10).max(1_000),
  bodyHtml: z.string().min(20),
  authorName: z.string().trim().min(2).max(120).nullable(),
  publishedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  heroUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"))
    .nullable(),
  categorySlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(10),
  topicSlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(30),
  tagSlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(50),
  providerVersion: z.string().max(100).nullable(),
});

export const fixtureProviderArticleSchema = normalizedNewsArticleSchema.extend({
  fixtureSequence: z.number().int().nonnegative(),
});
