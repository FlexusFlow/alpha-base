import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { DbCategory, DbChannel } from '@/lib/types/database';
import { YTChannelPreview, YTVideo } from '@/lib/types/youtube';

async function getCategoryMap(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name');

  if (error) throw new Error(`Failed to fetch categories: ${error.message}`);

  const map = new Map<string, number>();
  for (const cat of data as DbCategory[]) {
    map.set(cat.name, cat.id);
  }
  return map;
}

export async function saveChannelWithVideos(
  supabase: SupabaseClient,
  userId: string,
  preview: YTChannelPreview,
  videos: YTVideo[],
  updateLastScraped = false,
): Promise<string> {
  // Upsert channel
  const channelData: Record<string, unknown> = {
    user_id: userId,
    channel_title: preview.channel_title,
    channel_url: preview.channel_url,
    total_videos: preview.total_videos,
  };
  if (updateLastScraped) {
    channelData.last_scraped_at = new Date().toISOString();
  }

  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .upsert(channelData, { onConflict: 'user_id,channel_url' })
    .select('id')
    .single();

  if (channelError) throw new Error(`Failed to save channel: ${channelError.message}`);

  const channelId = channel.id as string;

  // Resolve category names to IDs
  const categoryMap = await getCategoryMap(supabase);

  // Batch upsert videos
  const videoRows = videos.map((v) => ({
    channel_id: channelId,
    user_id: userId,
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

export async function getTranscribedVideoIds(
  supabase: SupabaseClient,
  videoIds: string[],
): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('videos')
    .select('video_id')
    .in('video_id', videoIds)
    .eq('is_transcribed', true);

  if (error) throw new Error(`Failed to check transcribed videos: ${error.message}`);

  return new Set((data ?? []).map((row: { video_id: string }) => row.video_id));
}

export async function markVideosTranscribed(
  supabase: SupabaseClient,
  videoIds: string[],
): Promise<void> {
  if (videoIds.length === 0) return;

  const { error } = await supabase
    .from('videos')
    .update({ is_transcribed: true })
    .in('video_id', videoIds);

  if (error) throw new Error(`Failed to mark videos as transcribed: ${error.message}`);
}

export async function getChannels(
  supabase: SupabaseClient,
): Promise<DbChannel[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('id, channel_title, channel_url, total_videos, last_scraped_at, created_at')
    .order('last_scraped_at', { ascending: false, nullsFirst: false });

  if (error) throw new Error(`Failed to fetch channels: ${error.message}`);
  return (data ?? []) as DbChannel[];
}

export async function getTranscribedCount(
  supabase: SupabaseClient,
  channelId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channelId)
    .eq('is_transcribed', true);

  if (error) throw new Error(`Failed to get transcribed count: ${error.message}`);
  return count ?? 0;
}

// Convenience wrappers using browser client (for use in client components)
export function createBrowserChannelHelpers() {
  const supabase = createClient();

  return {
    async getChannels() {
      return getChannels(supabase);
    },
    async getTranscribedVideoIds(videoIds: string[]) {
      return getTranscribedVideoIds(supabase, videoIds);
    },
    async markVideosTranscribed(videoIds: string[]) {
      return markVideosTranscribed(supabase, videoIds);
    },
    async getTranscribedCount(channelId: string) {
      return getTranscribedCount(supabase, channelId);
    },
  };
}
