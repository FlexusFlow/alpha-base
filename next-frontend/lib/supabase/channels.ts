import { createClient } from '@/lib/supabase/client';
import { DbCategory } from '@/lib/types/database';
import { YTChannelPreview, YTVideo } from '@/lib/types/youtube';

let categoryMapCache: Map<string, number> | null = null;

async function getCategoryMap(): Promise<Map<string, number>> {
  if (categoryMapCache) return categoryMapCache;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name');

  if (error) throw new Error(`Failed to fetch categories: ${error.message}`);

  const map = new Map<string, number>();
  for (const cat of data as DbCategory[]) {
    map.set(cat.name, cat.id);
  }
  categoryMapCache = map;
  return map;
}

export async function saveChannelWithVideos(
  preview: YTChannelPreview,
  videos: YTVideo[],
): Promise<string> {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  // Upsert channel
  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .upsert(
      {
        user_id: user.id,
        channel_title: preview.channel_title,
        channel_url: preview.channel_url,
        total_videos: preview.total_videos,
      },
      { onConflict: 'user_id,channel_url' },
    )
    .select('id')
    .single();

  if (channelError) throw new Error(`Failed to save channel: ${channelError.message}`);

  const channelId = channel.id as string;

  // Resolve category names to IDs
  const categoryMap = await getCategoryMap();

  // Batch upsert videos
  const videoRows = videos.map((v) => ({
    channel_id: channelId,
    user_id: user.id,
    video_id: v.video_id,
    title: v.title,
    url: v.url,
    views: v.views,
    category_id: categoryMap.get(v.category) ?? null,
  }));

  // Supabase has a row limit per request; batch in chunks of 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < videoRows.length; i += BATCH_SIZE) {
    const batch = videoRows.slice(i, i + BATCH_SIZE);
    const { error: videosError } = await supabase
      .from('videos')
      .upsert(batch, { onConflict: 'user_id,channel_id,video_id' });

    if (videosError) throw new Error(`Failed to save videos: ${videosError.message}`);
  }

  return channelId;
}

export async function getTranscribedVideoIds(videoIds: string[]): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();

  const supabase = createClient();

  const { data, error } = await supabase
    .from('videos')
    .select('video_id')
    .in('video_id', videoIds)
    .eq('is_transcribed', true);

  if (error) throw new Error(`Failed to check transcribed videos: ${error.message}`);

  return new Set((data ?? []).map((row: { video_id: string }) => row.video_id));
}

export async function markVideosTranscribed(videoIds: string[]): Promise<void> {
  if (videoIds.length === 0) return;

  const supabase = createClient();

  const { error } = await supabase
    .from('videos')
    .update({ is_transcribed: true })
    .in('video_id', videoIds);

  if (error) throw new Error(`Failed to mark videos as transcribed: ${error.message}`);
}
