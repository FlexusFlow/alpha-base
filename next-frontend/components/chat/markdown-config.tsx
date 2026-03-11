"use client"

import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import type { Components } from "react-markdown"
import type { PluggableList } from "unified"
import "highlight.js/styles/github-dark.min.css"

import { CodeBlock } from "./code-block"

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
  },
}

export const markdownRemarkPlugins: PluggableList = [remarkGfm]

export const markdownRehypePlugins: PluggableList = [
  rehypeHighlight,
  [rehypeSanitize, sanitizeSchema],
]

export const markdownComponents: Components = {
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
