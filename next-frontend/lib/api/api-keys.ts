export interface APIKeyItem {
  id: string
  key_prefix: string
  name: string
  created_at: string
  last_used_at: string | null
  is_active: boolean
}

export interface APIKeyCreateResponse {
  id: string
  key: string
  key_prefix: string
  name: string
}

export interface APIKeyListResponse {
  keys: APIKeyItem[]
}

export async function listAPIKeys(): Promise<APIKeyListResponse> {
  const res = await fetch("/api/keys")
  if (!res.ok) {
    throw new Error(`Failed to list API keys: ${res.status}`)
  }
  return res.json()
}

export async function createAPIKey(name: string): Promise<APIKeyCreateResponse> {
  const res = await fetch("/api/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    throw new Error(`Failed to create API key: ${res.status}`)
  }
  return res.json()
}

export async function revokeAPIKey(keyId: string): Promise<void> {
  const res = await fetch(`/api/keys?key_id=${keyId}`, {
    method: "DELETE",
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to revoke API key: ${res.status}`)
  }
}
