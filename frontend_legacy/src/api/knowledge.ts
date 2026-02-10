import type {
  KnowledgeAddRequest,
  KnowledgeAddResponse,
} from "../types/knowledge";
import apiClient from "./client";

export async function addToKnowledge(
  request: KnowledgeAddRequest
): Promise<KnowledgeAddResponse> {
  const response = await apiClient.post<KnowledgeAddResponse>(
    "/v1/api/knowledge/youtube/add",
    request
  );
  return response.data;
}
