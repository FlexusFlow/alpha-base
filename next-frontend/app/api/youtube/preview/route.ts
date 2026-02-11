import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { saveChannelWithVideos } from '@/lib/supabase/channels';
import { YTChannelPreview, YTVideo } from '@/lib/types/youtube';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

function normalizeChannelUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing /videos, /shorts, /streams, /playlists, etc.
    parsed.pathname = parsed.pathname.replace(/\/(videos|shorts|streams|playlists|featured|about)\/?$/, '');
    // Remove trailing slash
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    return parsed.toString();
  } catch {
    return url;
  }
}

function todayStartUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const url = searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
  const category = searchParams.get('category') || undefined;

  // Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const normalizedUrl = normalizeChannelUrl(url);

  try {
    // Cache check: was this channel scraped today?
    const { data: existingChannel } = await supabase
      .from('channels')
      .select('id, channel_title, channel_url, total_videos, last_scraped_at')
      .eq('channel_url', normalizedUrl)
      .eq('user_id', user.id)
      .gte('last_scraped_at', todayStartUTC())
      .maybeSingle();

    let channelId: string;
    let channelTitle: string;
    let channelUrl: string;
    let totalVideos: number;
    let categoryCounts: Record<string, number>;

    if (!existingChannel) {
      // CACHE MISS: Scrape from Python backend (all videos)
      const backendParams = new URLSearchParams({ url });
      const backendResponse = await fetch(
        `${PYTHON_BACKEND_URL}/v1/api/youtube/preview?${backendParams}`,
      );

      if (!backendResponse.ok) {
        const errorText = await backendResponse.text();
        return NextResponse.json(
          { error: `Backend scrape failed: ${errorText}` },
          { status: backendResponse.status },
        );
      }

      const scrapeResult: YTChannelPreview = await backendResponse.json();

      // Save all videos to Supabase with last_scraped_at
      // Use the normalized URL in the preview so cache lookups match
      const previewForSave = { ...scrapeResult, channel_url: normalizedUrl };
      channelId = await saveChannelWithVideos(
        supabase,
        user.id,
        previewForSave,
        scrapeResult.videos,
        true,
      );

      channelTitle = scrapeResult.channel_title;
      channelUrl = scrapeResult.channel_url;
      totalVideos = scrapeResult.total_videos;
      categoryCounts = scrapeResult.categories;
    } else {
      // CACHE HIT: Use existing channel data
      channelId = existingChannel.id;
      channelTitle = existingChannel.channel_title;
      channelUrl = existingChannel.channel_url;
      totalVideos = existingChannel.total_videos;

      // Compute category counts from videos table
      const { data: catCounts } = await supabase
        .from('videos')
        .select('category_id, categories(name)')
        .eq('channel_id', channelId);

      categoryCounts = {};
      for (const row of catCounts || []) {
        const catName = (row.categories as unknown as { name: string } | null)?.name;
        if (catName) {
          categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
        }
      }
    }

    // Query paginated videos from Supabase
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('videos')
      .select('video_id, title, url, views, category_id, categories(name)', { count: 'exact' })
      .eq('channel_id', channelId)
      .order('views', { ascending: false });

    if (category) {
      // Look up category_id by name
      const { data: catData } = await supabase
        .from('categories')
        .select('id')
        .eq('name', category)
        .maybeSingle();

      if (catData) {
        query = query.eq('category_id', catData.id);
      }
    }

    const { data: videos, count, error: videosError } = await query.range(offset, offset + pageSize - 1);

    if (videosError) {
      return NextResponse.json(
        { error: `Failed to query videos: ${videosError.message}` },
        { status: 500 },
      );
    }

    // Map to YTVideo shape
    const mappedVideos: YTVideo[] = (videos || []).map((v) => ({
      video_id: v.video_id,
      title: v.title,
      url: v.url,
      views: v.views,
      category: (v.categories as unknown as { name: string } | null)?.name || 'Unknown',
    }));

    const response: YTChannelPreview = {
      channel_title: channelTitle,
      channel_url: channelUrl,
      total_videos: count ?? totalVideos,
      categories: categoryCounts,
      videos: mappedVideos,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
