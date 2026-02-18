export interface KnowledgeAddRequest {
  channel_title: string;
  videos: { video_id: string; title: string }[];
  user_id: string;
}

export interface KnowledgeAddResponse {
  job_id: string;
  message: string;
  total_videos: number;
}

export type JobStatus = "pending" | "in_progress" | "completed" | "failed";

export interface JobStatusUpdate {
  id: string;
  status: JobStatus;
  progress: number;
  total_videos: number;
  processed_videos: number;
  failed_videos: string[];
  succeeded_videos: string[];
  message: string;
}
