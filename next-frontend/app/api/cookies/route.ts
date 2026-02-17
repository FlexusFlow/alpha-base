import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractDomainFromFilename, normalizeDomain, getEarliestExpiry } from "@/lib/cookies";
import { CookieEntry } from "@/lib/types/cookies";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
const MAX_COOKIES_PER_USER = 50;

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: cookies, error } = await supabase
      .from("user_cookies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ cookies: cookies ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 1 MB." },
        { status: 400 }
      );
    }

    const rawDomain = extractDomainFromFilename(file.name);
    if (!rawDomain) {
      return NextResponse.json(
        { error: "Invalid filename. Expected format: {domain}.cookies.json" },
        { status: 400 }
      );
    }

    const domain = normalizeDomain(rawDomain);

    // Check for existing cookie for this domain
    const { data: existing } = await supabase
      .from("user_cookies")
      .select("id, file_path")
      .eq("user_id", user.id)
      .eq("domain", domain)
      .single();

    // Check cookie count limit (only if not replacing an existing one)
    if (!existing) {
      const { count } = await supabase
        .from("user_cookies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (count !== null && count >= MAX_COOKIES_PER_USER) {
        return NextResponse.json(
          { error: "Maximum cookie files reached. Please review and remove unnecessary cookies to upload new ones." },
          { status: 409 }
        );
      }
    }

    // Parse file content for expiration data
    const fileContent = await file.text();
    let earliestExpiry: string | null = null;
    try {
      const cookieEntries: CookieEntry[] = JSON.parse(fileContent);
      if (Array.isArray(cookieEntries)) {
        earliestExpiry = getEarliestExpiry(cookieEntries);
      }
    } catch {
      // File isn't valid JSON array — continue without expiry data
    }

    // If replacing, delete old file and record
    if (existing) {
      await supabase.storage.from("cookie-files").remove([existing.file_path]);
      await supabase.from("user_cookies").delete().eq("id", existing.id);
    }

    // Upload new file
    const filePath = `${user.id}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("cookie-files")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Insert database record
    const { data: cookie, error: insertError } = await supabase
      .from("user_cookies")
      .insert({
        user_id: user.id,
        domain,
        filename: file.name,
        file_path: filePath,
        earliest_expiry: earliestExpiry,
      })
      .select()
      .single();

    if (insertError) {
      // Clean up uploaded file if DB insert fails
      await supabase.storage.from("cookie-files").remove([filePath]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ cookie });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing cookie id" }, { status: 400 });
    }

    // Find the cookie (RLS ensures user can only see their own)
    const { data: cookie, error: findError } = await supabase
      .from("user_cookies")
      .select("id, file_path")
      .eq("id", id)
      .single();

    if (findError || !cookie) {
      return NextResponse.json({ error: "Cookie not found" }, { status: 404 });
    }

    // Delete file from storage
    await supabase.storage.from("cookie-files").remove([cookie.file_path]);

    // Delete database record
    const { error: deleteError } = await supabase
      .from("user_cookies")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
