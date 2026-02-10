export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

export interface ChatRequest {
  project_id: string
  message: string
  history: ChatMessage[]
}
