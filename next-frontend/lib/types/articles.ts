export interface Article {
  id: string;
  url: string;
  title: string | null;
  content_markdown: string | null;
  summary: string | null;
  status: 'pending' | 'scraping' | 'completed' | 'failed';
  error_message: string | null;
  is_truncated: boolean;
  created_at: string;
}

export interface ArticleScrapeResponse {
  job_id: string;
  article_id: string;
  message: string;
}

export interface CookieCheckResponse {
  has_cookies: boolean;
  domain: string;
}
