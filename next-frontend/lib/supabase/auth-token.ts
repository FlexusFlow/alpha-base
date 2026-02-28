import { createClient } from "@/lib/supabase/server";

/**
 * Get the current user's Supabase access token from the server-side session.
 * For use in Next.js API routes when forwarding requests to FastAPI.
 *
 * Returns null if no session is available (user not authenticated).
 */
export async function getServerAuthToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

/**
 * Get Authorization headers for forwarding to FastAPI from server-side routes.
 */
export async function getServerAuthHeaders(): Promise<Record<string, string>> {
  const token = await getServerAuthToken();
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}
