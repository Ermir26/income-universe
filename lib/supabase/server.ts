import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Lazy-initialize to avoid crashing at module load when env vars are missing
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    if (!supabaseUrl || !serviceRoleKey) {
      // Return a mock-safe proxy that returns empty results
      return new Proxy({} as SupabaseClient, {
        get(_target, prop) {
          if (prop === "from") {
            return () =>
              new Proxy(
                {},
                {
                  get() {
                    return (..._args: unknown[]) =>
                      Promise.resolve({ data: null, error: null });
                  },
                }
              );
          }
          return undefined;
        },
      });
    }
    _client = createClient(supabaseUrl, serviceRoleKey);
  }
  return _client;
}

// Server-side client with service role (bypasses RLS)
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
