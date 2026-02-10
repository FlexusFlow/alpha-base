import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ChatWindow } from "@/components/chat/chat-window"
import { ChatMessage } from "@/lib/types/chat"

interface Props {
  params: Promise<{ id: string }>
}

async function ProjectChatContent({ id }: { id: string }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .single()

  if (!project) {
    redirect("/dashboard/projects")
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
        <h1 className="text-lg font-semibold">{project.name}</h1>
      </div>
      <ChatWindow projectId={id} initialMessages={initialMessages} />
    </div>
  )
}

export default async function ProjectChatPage({ params }: Props) {
  const { id } = await params

  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <ProjectChatContent id={id} />
    </Suspense>
  )
}
