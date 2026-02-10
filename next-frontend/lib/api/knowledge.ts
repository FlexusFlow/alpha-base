import { KnowledgeAddRequest, KnowledgeAddResponse } from '../types/knowledge';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export async function addToKnowledge(request: KnowledgeAddRequest): Promise<KnowledgeAddResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/api/knowledge/youtube/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Failed to add to knowledge: ${response.statusText}`);
  }
  return response.json();
}
