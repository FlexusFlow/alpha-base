import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const NEXT_PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true;
    }

    const blocked = ['localhost', '0.0.0.0', '127.0.0.1', '169.254.169.254', '[::1]'];
    if (blocked.includes(hostname)) {
      return true;
    }

    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
      if (a === 127) return true;
    }

    return false;
  } catch {
    return true;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { url, use_cookies = true } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  if (isBlockedUrl(url)) {
    return NextResponse.json({ error: 'URL is not allowed (blocked address)' }, { status: 400 });
  }

  try {
    const backendResponse = await fetch(
      `${NEXT_PUBLIC_API_BASE_URL}/v1/api/documentation/discover`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          user_id: user.id,
          use_cookies,
        }),
      },
    );

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
