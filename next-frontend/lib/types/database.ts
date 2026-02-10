export interface DbChannel {
  id: string;
  user_id: string;
  channel_title: string;
  channel_url: string;
  total_videos: number;
  created_at: string;
  updated_at: string;
}

export interface DbVideo {
  id: string;
  channel_id: string;
  user_id: string;
  video_id: string;
  title: string;
  url: string;
  views: number;
  category_id: number | null;
  is_transcribed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbCategory {
  id: number;
  name: string;
}
