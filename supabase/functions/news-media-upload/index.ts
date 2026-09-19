import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  handleNewsMediaUploadRequest,
  type StorageClient,
  type UserScopedClient,
} from "../_shared/news-media-upload.ts";

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = environment.SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error("NEWS_MEDIA_UPLOAD_CONFIGURATION_MISSING");
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve((request) =>
  handleNewsMediaUploadRequest(request, {
    supabaseUrl,
    // `serviceClient.from(...)` is the Postgres/PostgREST query builder, not
    // storage -- storage access is namespaced under `.storage.from(...)`.
    // Passing the bare client here throws "upload is not a function" on
    // every real request; only the unit tests' hand-rolled StorageClient
    // mock ever exercised the `.from().upload()` shape, so this never
    // actually worked end-to-end until this fix.
    serviceClient: serviceClient.storage as unknown as StorageClient,
    createUserClient: (accessToken: string) =>
      createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      }) as unknown as UserScopedClient,
  }),
);
