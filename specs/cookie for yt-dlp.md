Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Plan: Pass Cookies to yt-dlp from Cookie Content String                                                                                            

 Context

 The app currently stores cookies as JSON files (CookieEntry[]) in Supabase storage. When scraping, it downloads the JSON, parses it, and injects
 cookies into a Playwright browser context. Now we need to also support passing these same cookies to yt-dlp, which requires cookies in
 Netscape/Mozilla cookie file format — a completely different format from our JSON.

 Given a var cookieContent: string containing the stringified JSON cookies object (same format stored in Supabase), we need to convert it to a
 Netscape cookie file and pass it to yt-dlp via --cookies /path/to/file.txt.

 Current Cookie Format (JSON — CookieEntry[])

 Defined in lib/types.ts:30-39:
 interface CookieEntry {
   name: string
   value: string
   domain: string
   path: string
   expires?: number
   httpOnly?: boolean
   secure?: boolean
   sameSite?: 'Strict' | 'Lax' | 'None'
 }

 Stored as JSON array: [{ name, value, domain, path, ... }, ...]

 Target Cookie Format (Netscape/Mozilla)

 yt-dlp requires the first line to be # Netscape HTTP Cookie File, followed by tab-separated lines:

 # Netscape HTTP Cookie File
 <domain>       <include_subdomains>    <path>  <secure>        <expires>       <name>  <

 Field mapping from CookieEntry:
 ┌────────────────────┬───────────────────────────────┬─────────────────────────────────────────────────┐
 │   Netscape Field   │            Source             │                      Notes                      │
 ├────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
 │ domain             │ cookie.domain                 │ Keep as-is (leading . means include subdomains) │
 ├────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
 │ include_subdomains │ cookie.domain.startsWith('.') │ TRUE if domain starts with ., else FALSE        │
 ├────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
 │ path               │ cookie.path || '/'            │ Default to /                                    │
 ├────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
 │ secure             │ cookie.secure                 │ TRUE or FALSE                                   │
 ├────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
 │ expires            │ cookie.expires || 0           │ Unix timestamp; 0 = session cookie              │
 ├────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
 │ name               │ cookie.name                   │ As-is                                           │
 ├────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
 │ value              │ cookie.value                  │ As-is                                           │
 └────────────────────┴───────────────────────────────┴─────────────────────────────────────────────────┘
 Implementation

 Step 1: Create conversion utility

 File: lib/cookies.ts (add to existing file)

 Add a function convertCookiesToNetscapeFormat:

 /**
  * Converts a CookieEntry[] JSON string to Netscape/Mozilla cookie file format
  * for use with tools like yt-dlp (--cookies flag).
  */
 export function convertCookiesToNetscapeFormat(cookieContent: string): string {
   const cookies: CookieEntry[] = JSON.parse(cookieContent)

   const lines = ['# Netscape HTTP Cookie File']

   for (const cookie of cookies) {
     const domain = cookie.domain
     const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE'
     const path = cookie.path || '/'
     const secure = cookie.secure ? 'TRUE' : 'FALSE'
     const expires = cookie.expires ? Math.round(cookie.expires) : 0
     const name = cookie.name
     const value = cookie.value

     lines.push(`${domain}\t${includeSubdomains}\t${path}\t${secure}\t${expires}\t${name}\t${value}`)
   }

   return lines.join('\n') + '\n'
 }

 Step 2: Write temp file and pass to yt-dlp

 When calling yt-dlp, write the Netscape cookie string to a temp file and use --cookies:

 import { writeFile, unlink } from 'fs/promises'
 import { join } from 'path'
 import { tmpdir } from 'os'
 import { randomUUID } from 'crypto'

 async function downloadWithYtDlp(url: string, cookieContent: string) {
   const netscapeCookies = convertCookiesToNetscapeFormat(cookieContent)
   const cookiePath = join(tmpdir(), `yt-dlp-cookies-${randomUUID()}.txt`)

   try {
     await writeFile(cookiePath, netscapeCookies, 'utf-8')

     // Pass to yt-dlp: --cookies <path>
     // e.g., spawn('yt-dlp', ['--cookies', cookiePath, url])
   } finally {
     // Clean up temp file
     await unlink(cookiePath).catch(() => {})
   }
 }

 Files to Modify

 1. lib/cookies.ts — Add convertCookiesToNetscapeFormat() function
 2. Whatever module calls yt-dlp — Use the conversion utility + temp file pattern

 Verification

 1. Unit test: Convert a known CookieEntry[] JSON string and verify the output matches Netscape format with correct header and tab-separated fields
 2. Manual test: Export the generated Netscape file and run yt-dlp --cookies /path/to/file.txt <url> to confirm it works
 3. Verify newlines are \n (LF) on macOS/Linux as required by yt-dlp~