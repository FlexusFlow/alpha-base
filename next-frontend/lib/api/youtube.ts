import { YTChannelPreview } from '../types/youtube';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export interface PreviewChannelOptions {
  url: string;
  skip?: number;
  limit?: number;
  category?: string;
}

export async function previewChannel(options: PreviewChannelOptions): Promise<YTChannelPreview> {
  const { url, skip, limit, category } = options;

  // Build query string manually to avoid double-encoding the URL
  const queryParams: string[] = [`url=${encodeURIComponent(url)}`];

  if (skip !== undefined) queryParams.push(`skip=${skip}`);
  if (limit !== undefined) queryParams.push(`limit=${limit}`);
  if (category) queryParams.push(`category=${encodeURIComponent(category)}`);

  const queryString = queryParams.join('&');

  const response = await fetch(`${API_BASE_URL}/v1/api/youtube/preview?${queryString}`);
  if (!response.ok) {
    throw new Error(`Failed to preview channel: ${response.statusText}`);
  }
  return response.json();
}
