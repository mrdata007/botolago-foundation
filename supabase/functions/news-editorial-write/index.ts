import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  handleNewsEditorialWriteRequest,
  type ServiceRoleClient,
  type UserScopedClient,
} from "../_shared/news-editorial-write.ts";
import {
  NEWS_SANITIZER_VERSION,
  sanitizeEditorialHtmlTrusted,
} from "../_shared/news-editorial-sanitizer.ts";

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = environment.SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error("NEWS_EDITORIAL_WRITE_CONFIGURATION_MISSING");
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve((request) =>
  handleNewsEditorialWriteRequest(request, {
    // Only this client can ever call editorial_write_secret_for_service --
    // it is granted to service_role alone, and a browser can never present a
    // service_role JWT.
    serviceClient: serviceClient as unknown as ServiceRoleClient,
    createUserClient: (accessToken: string) =>
      createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      }) as unknown as UserScopedClient,
    sanitize: sanitizeEditorialHtmlTrusted,
    sanitizerVersion: NEWS_SANITIZER_VERSION,
  }),
);
