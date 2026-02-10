import { ChatRequest } from '@/lib/types/chat'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

export async function sendChatMessage(
  request: ChatRequest,
  onToken: (token: string) => void,
  onDone: (sources: string[]) => void,
  onError: (error: string) => void,
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      onError(`Request failed: ${response.statusText}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      onError('No response stream')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (!data) continue

        try {
          const parsed = JSON.parse(data)
          if (parsed.token) {
            onToken(parsed.token)
          } else if (parsed.done) {
            onDone(parsed.sources || [])
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error')
  }
}
