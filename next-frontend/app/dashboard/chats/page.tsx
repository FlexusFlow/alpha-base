"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, MessageSquare, Trash2 } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Chat } from "@/lib/types/project"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default function ChatsPage() {
  const [chats, setChats] = useState<Chat[]>([])
  const [newName, setNewName] = useState("")
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchChats()
  }, [])

  async function fetchChats() {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })

    if (!error && data) {
      setChats(data)
    }
    setLoading(false)
  }

  async function createChat() {
    const name = newName.trim()
    if (!name) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name })
      .select()
      .single()

    if (!error && data) {
      setNewName("")
      router.push(`/dashboard/chats/${data.id}`)
    }
  }

  async function deleteChat(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)

    if (!error) {
      setChats(chats.filter((c) => c.id !== id))
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Chats</h1>

      <div className="flex gap-2 mb-6">
        <Input
          placeholder="New chat name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createChat()}
        />
        <Button onClick={createChat} disabled={!newName.trim()}>
          <Plus className="h-4 w-4 mr-1" />
          New
        </Button>
      </div>

      {chats.length === 0 ? (
        <p className="text-muted-foreground">
          No chats yet. Create one to start chatting with your knowledge base.
        </p>
      ) : (
        <div className="space-y-2">
          {chats.map((chat) => (
            <Card
              key={chat.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => router.push(`/dashboard/chats/${chat.id}`)}
            >
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{chat.name}</CardTitle>
                    <CardDescription>
                      {new Date(chat.created_at).toLocaleDateString()}
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => deleteChat(chat.id, e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
