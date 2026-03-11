"use client"

import { useState, useRef, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  children?: ReactNode
}

export function CodeBlock({ children, ...props }: Props) {
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  function handleCopy() {
    const text = preRef.current?.textContent ?? ""
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="group relative">
      <pre
        ref={preRef}
        {...props}
        className={cn(
          "overflow-x-auto rounded-md bg-zinc-950 p-4 text-sm",
          "dark:bg-zinc-900"
        )}
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "absolute right-2 top-2 rounded-md p-1.5 text-zinc-400",
          "opacity-0 transition-opacity group-hover:opacity-100",
          "hover:bg-zinc-800 hover:text-zinc-200"
        )}
        aria-label={copied ? "Copied" : "Copy code"}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
