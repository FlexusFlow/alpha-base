import { YTChannelPreview } from '../types/youtube';

export interface PreviewChannelOptions {
  url: string;
  page?: number;
  pageSize?: number;
  category?: string;
}

export async function previewChannel(options: PreviewChannelOptions): Promise<YTChannelPreview> {
  const { url, page, pageSize, category } = options;

  const queryParams: string[] = [`url=${encodeURIComponent(url)}`];

  if (page !== undefined) queryParams.push(`page=${page}`);
  if (pageSize !== undefined) queryParams.push(`pageSize=${pageSize}`);
  if (category) queryParams.push(`category=${encodeURIComponent(category)}`);

  const queryString = queryParams.join('&');

  const response = await fetch(`/api/youtube/preview?${queryString}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Failed to preview channel: ${response.statusText}`);
  }
  return response.json();
}
