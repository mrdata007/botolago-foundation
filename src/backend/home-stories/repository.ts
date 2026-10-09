import { z } from "zod";
import { getNewsApi, supabaseV2 } from "@/integrations/supabase/v2-client";
import { homeStorySchema, storyInputSchema, validateStoryFile, type StoryInput } from "./contracts";

// Narrow RPC adapter while the forward-only migration awaits deployment and
// generated types. All responses and write inputs are validated at this boundary.
export interface StoriesApi {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}
export class HomeStoriesRepository {
  constructor(private readonly injected?: StoriesApi) {}
  private async call(name: string, args?: Record<string, unknown>) {
    const api = this.injected ?? (getNewsApi() as unknown as StoriesApi);
    const { data, error } = await api.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  async list(publishedOnly = true) {
    return z
      .array(homeStorySchema)
      .parse(await this.call(publishedOnly ? "home_stories" : "admin_home_stories"));
  }
  async save(input: StoryInput, existing?: { id: string; version: number }) {
    const value = storyInputSchema.parse(input);
    return homeStorySchema.parse(
      await this.call("admin_save_home_story", {
        p_id: existing?.id ?? null,
        p_version: existing?.version ?? null,
        p_title_fr: value.titleFr,
        p_title_ar: value.titleAr,
        p_alt_fr: value.altFr,
        p_alt_ar: value.altAr,
        p_media_asset_id: value.mediaAssetId,
        p_destination: value.destination,
        p_credit: value.credit,
        p_position: value.position,
      }),
    );
  }
  async publish(story: { id: string; version: number }, published: boolean) {
    return homeStorySchema.parse(
      await this.call("admin_publish_home_story", {
        p_id: story.id,
        p_version: story.version,
        p_published: published,
      }),
    );
  }
}
export const homeStoriesRepository = new HomeStoriesRepository();

export async function uploadStoryImage(file: File, alt: string, credit: string) {
  validateStoryFile(file);
  const description = z.string().trim().min(1).max(300).parse(alt);
  const url = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("story_invalid_file"));
      img.src = url;
    });
    if (
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > 12000 ||
      dimensions.height > 12000
    )
      throw new Error("story_invalid_file");
    const { data } = await supabaseV2.auth.getSession();
    if (!data.session) throw new Error("no_session");
    const form = new FormData();
    form.set("file", file, file.name);
    form.set("altText", description);
    form.set("width", String(dimensions.width));
    form.set("height", String(dimensions.height));
    if (credit.trim()) form.set("credit", credit.trim());
    const result = await supabaseV2.functions.invoke("news-media-upload", {
      body: form,
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    if (result.error) throw result.error;
    return z
      .object({ mediaAssetId: z.string().uuid(), storagePath: homeStorySchema.shape.storagePath })
      .parse(result.data);
  } finally {
    URL.revokeObjectURL(url);
  }
}
