export interface YTVideo {
  video_id: string;
  title: string;
  url: string;
  views: number;
  category: string;
  is_transcribed: boolean;
}

export interface YTChannelPreview {
  channel_title: string;
  channel_url: string;
  total_videos: number;
  categories: Record<string, number>;
  videos: YTVideo[];
}
