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
 * Finds the earliest expiration timestamp from an array of cookie entries.
 * Returns an ISO date string or null if no expiry data is found.
 */
export function getEarliestExpiry(
  cookies: CookieEntry[]
): string | null {
  let earliest: number | null = null;

  for (const cookie of cookies) {
    if (cookie.expires && cookie.expires > 0) {
      if (earliest === null || cookie.expires < earliest) {
        earliest = cookie.expires;
      }
    }
  }

  if (earliest === null) return null;
  return new Date(earliest * 1000).toISOString();
}
