"use client"

import ReactMarkdown from "react-markdown"

import { cn } from "@/lib/utils"
import { ChatMessage as ChatMessageType } from "@/lib/types/chat"
import {
  markdownRemarkPlugins,
  markdownRehypePlugins,
  markdownComponents,
} from "./markdown-config"

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
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-transparent prose-pre:p-0">
            <ReactMarkdown
              remarkPlugins={markdownRemarkPlugins}
              rehypePlugins={markdownRehypePlugins}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 border-t border-border/40 pt-2 text-xs opacity-70">
            <span className="font-medium">Sources:</span>
            <ul className="mt-1 space-y-0.5 list-none pl-0">
              {message.sources.map((src, i) => (
                <li key={i} className="pl-0">
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
