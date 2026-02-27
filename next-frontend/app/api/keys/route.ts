import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getServerAuthHeaders } from "@/lib/supabase/auth-token"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const authHeaders = await getServerAuthHeaders()
  const res = await fetch(
    `${API_BASE_URL}/v1/api/keys`,
    { method: "GET", headers: { ...authHeaders } }
  )

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()

  const authHeaders = await getServerAuthHeaders()
  const res = await fetch(`${API_BASE_URL}/v1/api/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const keyId = searchParams.get("key_id")

  if (!keyId) {
    return NextResponse.json({ error: "key_id required" }, { status: 400 })
  }

  const authHeaders = await getServerAuthHeaders()
  const res = await fetch(
    `${API_BASE_URL}/v1/api/keys/${keyId}`,
    { method: "DELETE", headers: { ...authHeaders } }
  )

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 })
  }

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
