const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const annotation = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};
const file = object({
  name: { type: "string", maxLength: 200 },
  mimeType: string,
  base64: { type: "string", minLength: 4, maxLength: 28_000_000 },
});

export const edgeTools = [
  {
    name: "admin_news_create_draft",
    edge: "news-editorial-write",
    action: "create_draft",
    description:
      "Create an editorial draft through BotolaGO's trusted HTML sanitizer. Uses the caller's editorial permission and audit rules.",
    inputSchema: object(
      {
        language: { enum: ["fr", "ar"] },
        slug: string,
        title: string,
        summary: string,
        bodyFormat: { enum: ["markdown", "rich_text"] },
        bodySource: nullableString,
        bodyHtml: string,
        storyId: nullableString,
        authorId: nullableString,
        publisherId: nullableString,
      },
      ["language", "slug", "title", "summary", "bodyFormat", "bodySource", "bodyHtml"],
    ),
  },
  {
    name: "admin_news_update_article",
    edge: "news-editorial-write",
    action: "update_article",
    description:
      "Update an editorial article through the trusted HTML sanitizer. Pass its current expectedUpdatedAt to preserve concurrent-edit protection.",
    inputSchema: object(
      {
        articleEditionId: string,
        expectedUpdatedAt: string,
        slug: string,
        title: string,
        subtitle: nullableString,
        summary: string,
        bodyFormat: { enum: ["markdown", "rich_text"] },
        bodySource: nullableString,
        bodyHtml: string,
        heroAssetId: nullableString,
        seoTitle: nullableString,
        seoDescription: nullableString,
      },
      [
        "articleEditionId",
        "expectedUpdatedAt",
        "slug",
        "title",
        "subtitle",
        "summary",
        "bodyFormat",
        "bodySource",
        "bodyHtml",
      ],
    ),
  },
  {
    name: "admin_upload_news_media",
    edge: "news-media-upload",
    multipart: true,
    description:
      "Upload a supplied image for an article or home story. Provide file bytes as base64, alt text, dimensions, and optional credit. No URL fetching. Existing validation and editorial permission apply.",
    inputSchema: object(
      {
        file,
        altText: string,
        width: { type: "integer", minimum: 1, maximum: 12000 },
        height: { type: "integer", minimum: 1, maximum: 12000 },
        credit: string,
      },
      ["file", "altText", "width", "height"],
    ),
  },
  {
    name: "admin_upload_player_photo",
    edge: "player-photo-upload",
    multipart: true,
    description:
      "Submit a player photo and its signed release document. Both files are supplied as base64; creates a pending release under the existing permissions and independent approval rules.",
    inputSchema: object({
      photo: file,
      document: file,
      metadata: object(
        {
          playerId: string,
          capturedOn: string,
          signedOn: string,
          signerRole: { enum: ["player", "guardian"] },
          scope: { enum: ["in_app", "in_app_and_social"] },
          licenceCode: string,
          credit: string,
          copyrightOwner: string,
          expiresOn: string,
        },
        [
          "playerId",
          "capturedOn",
          "signedOn",
          "signerRole",
          "scope",
          "licenceCode",
          "credit",
          "copyrightOwner",
        ],
      ),
    }),
  },
].map((tool) => ({ ...tool, annotations: annotation }));

export function multipartBody(name, args) {
  const body = new FormData();
  const entries =
    name === "admin_upload_player_photo"
      ? { ...args.metadata, photo: args.photo, document: args.document }
      : args;
  for (const [key, value] of Object.entries(entries)) {
    if (["file", "photo", "document"].includes(key)) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64) || value.base64.length % 4)
        throw new Error("invalid_file");
      const bytes = Buffer.from(value.base64, "base64");
      const limit = key === "photo" ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
      if (!bytes.length || bytes.length > limit) throw new Error("invalid_file");
      body.set(key, new Blob([bytes], { type: value.mimeType }), value.name);
    } else body.set(key, String(value));
  }
  return body;
}
