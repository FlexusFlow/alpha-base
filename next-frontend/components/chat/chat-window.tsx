"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, ArrowDown, Send, Sparkles } from "lucide-react"

import { ChatMessage } from "@/lib/types/chat"
import { getChatConfig, sendChatMessage } from "@/lib/api/chat"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ChatMessageBubble } from "./chat-message"

interface Props {
  projectId: string
  initialMessages: ChatMessage[]
}

export function ChatWindow({ projectId, initialMessages }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [extendedSearch, setExtendedSearch] = useState(false)
  const [webSearchAvailable, setWebSearchAvailable] = useState<boolean | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)

  const checkIfScrolledToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const threshold = 40
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    setShowScrollDown(!isAtBottom)
  }, [])

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    getChatConfig().then((config) => {
      setWebSearchAvailable(config.web_search_available)
    })
  }, [])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    el.addEventListener("scroll", checkIfScrolledToBottom)
    const observer = new ResizeObserver(checkIfScrolledToBottom)
    observer.observe(el)
    return () => {
      el.removeEventListener("scroll", checkIfScrolledToBottom)
      observer.disconnect()
    }
  }, [checkIfScrolledToBottom])

  useEffect(() => {
    // Auto-scroll to bottom on new messages only if already near bottom
    const el = scrollContainerRef.current
    if (!el) return
    const threshold = 100
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold + 200
    if (isAtBottom) {
      scrollToBottom()
    } else {
      checkIfScrolledToBottom()
    }
  }, [messages, checkIfScrolledToBottom])

  async function handleSend() {
    const text = input.trim()
    if (!text || streaming) return

    const userMessage: ChatMessage = { role: "user", content: text }
    const history = [...messages]

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    setStreaming(true)
    // Always scroll to bottom when user sends a message
    setTimeout(scrollToBottom, 0)

    // Add placeholder for streaming assistant message
    const assistantMessage: ChatMessage = { role: "assistant", content: "" }
    setMessages((prev) => [...prev, assistantMessage])

    await sendChatMessage(
      {
        project_id: projectId,
        message: text,
        history: history.map(({ role, content }) => ({ role, content })),
        extended_search: extendedSearch,
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
      (sources, sourceTypes) => {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = { ...last, sources, sourceTypes }
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

  const showWebSearchWarning = extendedSearch && webSearchAvailable === false

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="relative flex-1 min-h-0">
      <div className="h-full overflow-y-auto p-6 space-y-4" ref={scrollContainerRef}>
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
      {showScrollDown && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-10">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full shadow-md bg-background/90 backdrop-blur-sm h-9 w-9"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
      )}
      </div>

      <div className="border-t p-4">
        <div className="flex flex-col gap-2 mx-auto w-full">
           <div className="flex gap-2 w-full items-end">
            <Textarea
              ref={textareaRef}
              placeholder="Type a message..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                const ta = e.target
                ta.style.height = "auto"
                ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={streaming}
              rows={1}
              className="min-h-[40px] max-h-[300px] resize-none overflow-y-auto"
            />
            <Button onClick={handleSend} disabled={!input.trim() || streaming} className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="extended-search"
                checked={extendedSearch}
                onCheckedChange={(checked) => setExtendedSearch(checked === true)}
              />
              <label
                htmlFor="extended-search"
                className="text-sm flex items-center gap-1 cursor-pointer select-none"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Extended search
              </label>
            </div>
            {showWebSearchWarning && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Web search is not configured and not available</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
