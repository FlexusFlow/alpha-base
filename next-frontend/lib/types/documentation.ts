export interface DiscoveredPage {
  url: string;
  title: string;
}

export interface DocumentationCollection {
  id: string;
  user_id: string;
  entry_url: string;
  site_name: string | null;
  scope_path: string;
  total_pages: number;
  successful_pages: number;
  status: 'discovering' | 'pending_confirmation' | 'scraping' | 'completed' | 'partial' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentationPage {
  id: string;
  collection_id: string;
  user_id: string;
  page_url: string;
  title: string | null;
  content_markdown: string | null;
  status: 'pending' | 'scraping' | 'completed' | 'failed';
  error_message: string | null;
  is_truncated: boolean;
  display_order: number;
  created_at: string;
}

export interface DiscoveryResponse {
  entry_url: string;
  scope_path: string;
  site_name: string;
  pages: DiscoveredPage[];
  total_count: number;
  truncated: boolean;
  original_count?: number;
  has_cookies: boolean;
}

export interface ScrapeResponse {
  job_id: string;
  collection_id: string;
  message: string;
}

export interface RetryResponse {
  job_id: string;
  collection_id: string;
  retry_count: number;
  message: string;
}

export interface DocJobStatusUpdate {
  id: string;
  status: string;
  progress: number;
  total_pages: number;
  processed_pages: number;
  failed_pages: string[];
  succeeded_pages: string[];
  message: string;
}
