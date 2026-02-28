import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServerAuthHeaders } from '@/lib/supabase/auth-token';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const authHeaders = await getServerAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/v1/api/deep-memory/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
