import { z } from "zod";
import { getNewsApi, supabaseV2 } from "@/integrations/supabase/v2-client";
import type { StoriesApi } from "@/backend/home-stories/repository";
export const draftSchema = z.object({
  id: z.uuid(),
  sourceUrl: z.url(),
  label: z.string(),
  fixtureId: z.uuid().nullable(),
  storyId: z.uuid().nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  status: z.enum(["held", "processing", "failed", "discarded"]),
  rightsStatus: z.literal("unverified"),
  hasResult: z.boolean(),
  errorCode: z.string().nullable(),
  version: z.number().int(),
  attempts: z.number().int(),
  leaseUntil: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MatchVisualDraft = z.infer<typeof draftSchema>;
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
export class MatchVisualDraftsRepository {
  constructor(private readonly api?: StoriesApi) {}
  private async call(name: string, args?: Record<string, unknown>) {
    const { data, error } = await (this.api ?? (getNewsApi() as unknown as StoriesApi)).rpc(
      name,
      args,
    );
    if (error) throw Error(error.message);
    return data;
  }
  async list() {
    return z.array(draftSchema).parse(await this.call("admin_match_visual_drafts"));
  }
  async discard(draft: MatchVisualDraft) {
    await this.call("admin_discard_match_visual_draft", {
      p_id: draft.id,
      p_version: draft.version,
    });
  }
  private async invoke(body: FormData | Record<string, unknown>) {
    const { data } = await supabaseV2.auth.getSession();
    if (!data.session) throw Error("no_session");
    const result = await supabaseV2.functions.invoke("match-visual-drafts", {
      body,
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    if (result.error) throw result.error;
    return result.data;
  }
  async preview(id: string, variant: "source" | "result") {
    return z.object({ url: z.url() }).parse(await this.invoke({ action: "preview", id, variant }))
      .url;
  }
  async import(input: {
    file: File;
    sourceUrl: string;
    label: string;
    fixtureId: string;
    storyId: string;
  }) {
    const { file, width, height } = await normalizePhoto(input.file);
    const body = new FormData();
    body.set("action", "import");
    body.set("source", file);
    body.set("width", String(width));
    body.set("height", String(height));
    for (const key of ["sourceUrl", "label", "fixtureId", "storyId"] as const)
      body.set(key, input[key]);
    return draftSchema.parse(await this.invoke(body));
  }
  async edit(draft: MatchVisualDraft, rectangle: Rectangle, logo?: File) {
    const body = new FormData();
    body.set("action", "edit");
    body.set("id", draft.id);
    body.set("version", String(draft.version));
    body.set("rectangle", JSON.stringify(rectangle));
    body.set("branding", await makeBranding(logo, draft.width, draft.height, rectangle));
    await this.invoke(body);
  }
}
export const matchVisualDraftsRepository = new MatchVisualDraftsRepository();
async function loadImage(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw Error("draft_invalid_file");
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(Error("draft_invalid_file"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function canvasFile(canvas: HTMLCanvasElement) {
  return new File(
    [
      await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(Error("draft_invalid_file"))),
          "image/png",
        ),
      ),
    ],
    "image.png",
    { type: "image/png" },
  );
}
export async function normalizePhoto(file: File) {
  const image = await loadImage(file),
    width = image.naturalWidth,
    height = image.naturalHeight;
  if (width > 1536 || height > 1536 || width < 1 || height < 1)
    throw Error("draft_image_too_large");
  // No resizing or cropping: pin the decoded source pixels in a lossless PNG.
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0);
  return { file: await canvasFile(canvas), width, height };
}
export function defaultBrandUrl(r: Rectangle) {
  return r.width / r.height >= 2.5
    ? new URL("../../assets/brand/botolago-wordmark-light.svg", import.meta.url).href
    : new URL("../../assets/brand/botolago-mark-light.svg", import.meta.url).href;
}
export async function makeBranding(
  file: File | undefined,
  width: number,
  height: number,
  r: Rectangle,
) {
  if (file && file.type !== "image/png") throw Error("draft_brand_must_be_png");
  const logo = file
    ? await loadImage(file)
    : await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(Error("draft_brand_unavailable"));
        image.src = defaultBrandUrl(r);
      });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const scale = Math.min(r.width / logo.naturalWidth, r.height / logo.naturalHeight);
  const w = Math.max(1, Math.floor(logo.naturalWidth * scale)),
    h = Math.max(1, Math.floor(logo.naturalHeight * scale));
  canvas
    .getContext("2d")!
    .drawImage(
      logo,
      r.x + Math.floor((r.width - w) / 2),
      r.y + Math.floor((r.height - h) / 2),
      w,
      h,
    );
  return canvasFile(canvas);
}
