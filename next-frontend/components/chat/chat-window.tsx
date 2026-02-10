"use client"

import { useEffect, useRef, useState } from "react"
import { Send } from "lucide-react"

import { ChatMessage } from "@/lib/types/chat"
import { sendChatMessage } from "@/lib/api/chat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChatMessageBubble } from "./chat-message"

interface Props {
  projectId: string
  initialMessages: ChatMessage[]
}

export function ChatWindow({ projectId, initialMessages }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || streaming) return

    const userMessage: ChatMessage = { role: "user", content: text }
    const history = [...messages]

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setStreaming(true)

    // Add placeholder for streaming assistant message
    const assistantMessage: ChatMessage = { role: "assistant", content: "" }
    setMessages((prev) => [...prev, assistantMessage])

    await sendChatMessage(
      {
        project_id: projectId,
        message: text,
        history: history.map(({ role, content }) => ({ role, content })),
      },
      (token) => {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = {
            ...last,
            content: last.content + token,
          }
          return updated
        })
      },
      (sources) => {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = { ...last, sources }
          return updated
        })
        setStreaming(false)
      },
      (error) => {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Error: ${error}`,
          }
          return updated
        })
        setStreaming(false)
      },
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-muted-foreground mt-12">
            Ask questions about your knowledge base
          </p>
        )}
        {messages.map((msg, i) => (
          <ChatMessageBubble key={i} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Input
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={streaming}
          />
          <Button onClick={handleSend} disabled={!input.trim() || streaming}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
