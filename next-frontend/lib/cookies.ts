import { CookieEntry } from "@/lib/types/cookies";

/**
 * Extracts domain from a cookie filename matching the pattern `<domain>.cookies.json`.
 * Returns null if the filename doesn't match the expected pattern.
 */
export function extractDomainFromFilename(
  filename: string
): string | null {
  const match = filename.match(/^(.+)\.cookies\.json$/i);
  return match ? match[1] : null;
}

/**
 * Normalizes a domain by lowercasing and stripping the `www.` prefix.
 */
export function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "");
}

/**
 * Finds the latest expiration timestamp from an array of cookie entries.
 * Uses the maximum expiry so short-lived session cookies don't mark
 * the whole file as expired while long-lived auth cookies are still valid.
 * Returns an ISO date string or null if no expiry data is found.
 */
export function getLatestExpiry(
  cookies: CookieEntry[]
): string | null {
  let latest: number | null = null;

  for (const cookie of cookies) {
    if (cookie.expires && cookie.expires > 0) {
      if (latest === null || cookie.expires > latest) {
        latest = cookie.expires;
      }
    }
  }

  if (latest === null) return null;
  return new Date(latest * 1000).toISOString();
}
