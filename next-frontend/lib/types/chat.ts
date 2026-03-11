export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  sourceTypes?: string[]
  kbRelevant?: boolean
  extendedSearch?: boolean
}

export interface ChatRequest {
  project_id: string
  message: string
  history: ChatMessage[]
  extended_search?: boolean
}

export interface ChatConfig {
  web_search_available: boolean
}
