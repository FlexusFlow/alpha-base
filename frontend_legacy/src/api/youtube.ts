import type { YTChannelPreview } from "../types/youtube";
import apiClient from "./client";

export async function previewChannel(
  url: string,
  limit?: number
): Promise<YTChannelPreview> {
  const response = await apiClient.get<YTChannelPreview>(
    "/v1/api/youtube/preview",
    { params: { url, limit } }
  );
  return response.data;
}
