import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    let domain = parsed.hostname.toLowerCase();
    if (domain.startsWith('www.')) {
      domain = domain.slice(4);
    }
    return domain;
  } catch {
    return '';
  }
}

function getParentDomains(domain: string): string[] {
  const parts = domain.split('.');
  const parents: string[] = [];
  while (parts.length > 2) {
    parts.shift();
    parents.push(parts.join('.'));
  }
  return parents;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const domain = extractDomain(url);
  if (!domain) {
    return NextResponse.json({ has_cookies: false, domain: '' });
  }

  const domainsToTry = [domain, ...getParentDomains(domain)];

  for (const d of domainsToTry) {
    const { data } = await supabase
      .from('user_cookies')
      .select('id')
      .eq('user_id', user.id)
      .eq('domain', d)
      .limit(1);

    if (data && data.length > 0) {
      return NextResponse.json({ has_cookies: true, domain: d });
    }
  }

  return NextResponse.json({ has_cookies: false, domain });
}
