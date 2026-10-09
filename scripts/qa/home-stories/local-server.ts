// Disposable QA bridge: real story SQL + the real upload handler, with local
// file storage and fixture identity. Never imported by the application.
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { handleNewsMediaUploadRequest } from "../../../supabase/functions/_shared/news-media-upload";
const port = 4319;
const base = `http://127.0.0.1:${port}`;
const root = "/tmp/botolago-stories/uploads";
const claims = {
  sub: "91000000-0000-4000-8000-000000000001",
  session_id: "92000000-0000-4000-8000-000000000001",
  aal: "aal2",
};
const quote = (v: unknown) =>
  v === null || v === undefined
    ? "null"
    : typeof v === "boolean" || typeof v === "number"
      ? String(v)
      : "'" + String(v).replaceAll("'", "''") + "'";
function sql(query: string, authenticated = true) {
  const command = `begin; set local role ${authenticated ? "authenticated" : "anon"}; set local request.jwt.claims = ${quote(JSON.stringify(claims))}; ${query}; commit;`;
  const result = Bun.spawnSync(
    [
      "docker",
      "exec",
      "-i",
      "botolago-stories-test",
      "psql",
      "-qAt",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { stdin: Buffer.from(command), stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString().trim() || "null");
}
const args: Record<string, string[]> = {
  home_stories: [],
  admin_home_stories: [],
  admin_save_home_story: [
    "p_id",
    "p_version",
    "p_title_fr",
    "p_title_ar",
    "p_alt_fr",
    "p_alt_ar",
    "p_media_asset_id",
    "p_destination",
    "p_credit",
    "p_position",
  ],
  admin_publish_home_story: ["p_id", "p_version", "p_published"],
};
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization,apikey,content-type,x-client-info,accept-profile,content-profile",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (path.startsWith("/storage/v1/object/public/news-media/")) {
      const relative = path.slice("/storage/v1/object/public/news-media/".length);
      if (!/^news\/[a-z0-9/_-]+\.(webp|jpg|png|avif)$/.test(relative))
        return new Response(null, { status: 404, headers: cors });
      return new Response(Bun.file(`${root}/${relative}`), { headers: cors });
    }
    if (path === "/functions/v1/news-media-upload") {
      return handleNewsMediaUploadRequest(request, {
        supabaseUrl: base,
        serviceClient: {
          from: () => ({
            upload: async (path, body) => {
              await mkdir(dirname(`${root}/${path}`), { recursive: true });
              await Bun.write(`${root}/${path}`, body);
              return { error: null };
            },
            remove: async (paths) => {
              for (const path of paths) await rm(`${root}/${path}`, { force: true });
              return { error: null };
            },
          }),
        },
        createUserClient: () => ({
          auth: {
            getUser: async () => ({
              data: { user: { id: claims.sub, role: "authenticated" } },
              error: null,
            }),
          },
          schema: () => ({
            rpc: async (name, input) => {
              try {
                if (name === "get_my_staff_context")
                  return {
                    data: sql(`select api.get_my_staff_context()`),
                    error: null,
                  };
                // Metadata registration adapter for the harness's minimal media table.
                const id = crypto.randomUUID();
                const result = Bun.spawnSync(
                  [
                    "docker",
                    "exec",
                    "-i",
                    "botolago-stories-test",
                    "psql",
                    "-qAt",
                    "-U",
                    "postgres",
                    "-v",
                    "ON_ERROR_STOP=1",
                  ],
                  {
                    stdin: Buffer.from(
                      `insert into app.media_assets values (${quote(id)},${quote(input.p_storage_path)},${quote(input.p_mime_type)},'validated',${quote(input.p_credit)});`,
                    ),
                    stdout: "pipe",
                    stderr: "pipe",
                  },
                );
                if (result.exitCode) throw new Error(result.stderr.toString());
                return { data: { mediaAssetId: id }, error: null };
              } catch (error) {
                return { data: null, error: { message: String(error) } };
              }
            },
          }),
        }),
      });
    }
    const name = path.split("/").at(-1)!;
    if (path.startsWith("/rest/v1/rpc/") && name in args) {
      try {
        const input = (await request.json()) as Record<string, unknown>;
        const result = sql(
          `select api.${name}(${args[name].map((key) => quote(input[key])).join(",")})`,
          name !== "home_stories",
        );
        return Response.json(result, { headers: cors });
      } catch (error) {
        return Response.json(
          { message: String(error), code: "TEST_RPC_ERROR" },
          { status: 400, headers: cors },
        );
      }
    }
    return new Response(null, { status: 404, headers: cors });
  },
});
console.log(`Isolated stories QA backend: ${base}`);
