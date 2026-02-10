"use client"

import { cn } from "@/lib/utils"
import { ChatMessage as ChatMessageType } from "@/lib/types/chat"

interface Props {
  message: ChatMessageType
}

export function ChatMessageBubble({ message }: Props) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-4 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        )}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 border-t border-border/40 pt-2 text-xs opacity-70">
            <span className="font-medium">Sources:</span>
            <ul className="mt-1 space-y-0.5">
              {message.sources.map((src, i) => (
                <li key={i}>
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:no-underline"
                  >
                    {src}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
