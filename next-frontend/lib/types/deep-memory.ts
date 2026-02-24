export interface GenerateResponse {
  job_id: string;
  training_run_id: string;
  total_chunks: number;
  message: string;
}

export interface TrainResponse {
  job_id: string;
  training_run_id: string;
  message: string;
}

export interface TrainingRunSummary {
  id: string;
  status: string;
  pair_count: number;
  processed_chunks: number;
  total_chunks: number;
  error_message: string | null;
  metrics: Record<string, number>;
  started_at: string;
  completed_at: string | null;
}

export interface SamplePair {
  question_text: string;
  chunk_preview: string;
  relevance_score: number;
}

export interface TrainingRunDetail extends TrainingRunSummary {
  total_chunks: number;
  processed_chunks: number;
  deeplake_job_id: string | null;
  error_message: string | null;
  sample_pairs: SamplePair[];
  statistics: {
    avg_questions_per_chunk: number;
    chunk_coverage_pct: number;
  };
}

export interface ProceedResponse {
  job_id: string;
  training_run_id: string;
  message: string;
}

export interface DeepMemorySettings {
  enabled: boolean;
  last_trained_at: string | null;
  last_training_run_id: string | null;
  can_enable: boolean;
  total_chunks: number;
  trained_chunk_count: number;
  has_blocking_run: boolean;
  blocking_run_id: string | null;
  blocking_run_status: string | null;
  is_cloud: boolean;
}

export interface DeepMemoryJobUpdate {
  id: string;
  status: string;
  progress: number;
  processed_chunks?: number;
  total_chunks?: number;
  pair_count?: number;
  message?: string;
  metrics?: Record<string, number>;
  error_message?: string;
}
