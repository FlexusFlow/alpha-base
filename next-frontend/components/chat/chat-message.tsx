"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import type { Components } from "react-markdown"
import "highlight.js/styles/github-dark.min.css"

import { cn } from "@/lib/utils"
import { ChatMessage as ChatMessageType } from "@/lib/types/chat"
import { CodeBlock } from "./code-block"

interface Props {
  message: ChatMessageType
}

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
  },
}

const markdownComponents: Components = {
  pre({ children, ...props }) {
    return <CodeBlock {...props}>{children}</CodeBlock>
  },
  a({ children, href, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-primary/50 underline-offset-2 hover:decoration-primary"
        {...props}
      >
        {children}
      </a>
    )
  },
  code({ children, className, ...props }) {
    const isInline = !className
    if (isInline) {
      return (
        <code
          className="rounded bg-zinc-200 px-1.5 py-0.5 text-[0.85em] dark:bg-zinc-700"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
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
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight, [rehypeSanitize, sanitizeSchema]]}
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
