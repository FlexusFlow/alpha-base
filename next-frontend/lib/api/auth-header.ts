import { createClient } from "@/lib/supabase/client";

/**
 * Get Authorization headers with the current user's Supabase access token.
 * For use in browser-side fetch calls directly to the FastAPI backend.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {};
  }

  return { Authorization: `Bearer ${session.access_token}` };
}
