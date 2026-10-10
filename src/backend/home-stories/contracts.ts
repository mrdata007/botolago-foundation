import { z } from "zod";

export const STORY_DESTINATIONS = [
  "/news",
  "/fantasy",
  "/matches",
  "/matches/standings",
  "/pronostics",
  "/pepites",
  "/clubs",
  "/prizes",
] as const;
export const storyInputSchema = z.object({
  titleFr: z.string().trim().min(1).max(200),
  titleAr: z.string().trim().min(1).max(200),
  altFr: z.string().trim().min(1).max(300),
  altAr: z.string().trim().min(1).max(300),
  mediaAssetId: z.string().uuid(),
  destination: z.enum(STORY_DESTINATIONS).nullable(),
  credit: z.string().trim().max(300).nullable(),
  position: z.number().int().min(0).max(999),
});
export const homeStorySchema = storyInputSchema.extend({
  railLabel: z.string().trim().min(1).max(14).nullable().optional(),
  generated: z.boolean().default(false),
  id: z.string().uuid(),
  storagePath: z.string().regex(/^news\/[a-z0-9/_-]+\.(avif|jpg|jpeg|png|webp)$/),
  published: z.boolean(),
  version: z.number().int().positive(),
});
export type StoryInput = z.infer<typeof storyInputSchema>;
export type HomeStory = z.infer<typeof homeStorySchema>;
export const STORY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const STORY_MAX_BYTES = 10 * 1024 * 1024;
export function validateStoryFile(file: Pick<File, "type" | "size">): void {
  if (!STORY_IMAGE_TYPES.includes(file.type) || file.size <= 0 || file.size > STORY_MAX_BYTES)
    throw new Error("story_invalid_file");
}
