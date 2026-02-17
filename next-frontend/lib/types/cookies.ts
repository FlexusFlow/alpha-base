export interface UserCookie {
  id: string;
  user_id: string;
  domain: string;
  filename: string;
  file_path: string;
  earliest_expiry: string | null;
  created_at: string;
}

export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}
