import { getAuthHeaders } from '@/lib/api/auth-header';
import { KnowledgeAddRequest, KnowledgeAddResponse } from '../types/knowledge';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export interface TranscriptResponse {
  video_id: string;
  title: string;
  url: string;
  content: string;
}

export async function getVideoTranscript(videoId: string): Promise<TranscriptResponse> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/v1/api/knowledge/videos/${videoId}/transcript`, {
    headers: { ...authHeaders },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || `Failed to fetch transcript: ${response.statusText}`);
  }
  return response.json();
}

export async function addToKnowledge(request: KnowledgeAddRequest): Promise<KnowledgeAddResponse> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/v1/api/knowledge/youtube/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Failed to add to knowledge: ${response.statusText}`);
  }
  return response.json();
}
