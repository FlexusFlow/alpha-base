import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ChatWindow } from "@/components/chat/chat-window"
import { ChatMessage } from "@/lib/types/chat"

interface Props {
  params: Promise<{ id: string }>
}

async function ChatContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  const { data: chat } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .single()

  if (!chat) {
    redirect("/dashboard/chats")
  }

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("role, content, sources")
    .eq("project_id", id)
    .order("created_at", { ascending: true })

  const initialMessages: ChatMessage[] = (messages ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
    sources: Array.isArray(m.sources) ? m.sources : [],
  }))

  return (
    <div className="flex flex-col h-[calc(100vh-2.5rem)]">
      <div className="border-b px-6 py-3">
        <h1 className="text-lg font-semibold">{chat.name}</h1>
      </div>
      <ChatWindow chatId={id} initialMessages={initialMessages} />
    </div>
  )
}

export default function ChatPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <ChatContent params={params} />
    </Suspense>
  )
}
