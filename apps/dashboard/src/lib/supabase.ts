import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Connection settings come from build-time env (Cloudflare Pages) or, as a fallback for a static
 * deploy without env vars, from values the owner enters once (kept in this browser only).
 */
const KEY = 'hickey.dashboard.config'

export interface DashConfig {
  url: string
  anonKey: string
}

export function loadConfig(): DashConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url && anonKey) return { url, anonKey }
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DashConfig) : null
  } catch {
    return null
  }
}

export function saveConfig(cfg: DashConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch {}
}

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (client) return client
  const cfg = loadConfig()
  if (!cfg) throw new Error('Dashboard is not configured')
  client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  return client
}

export function resetClient(): void {
  client = null
}
