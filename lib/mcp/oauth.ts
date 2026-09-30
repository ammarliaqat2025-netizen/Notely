import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const OAUTH_SCOPES = ['notes:read','notes:write','timeline:read','search:read','context:read','intelligence:read'] as const
export type OAuthScope = (typeof OAUTH_SCOPES)[number]

export type OAuthClient = {
  client_id: string
  client_name: string
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  token_endpoint_auth_method: string
  client_metadata_url: string | null
}

export function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('MCP_AUTH_CONFIG_MISSING')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
export function randomToken(bytes = 32): string { return randomBytes(bytes).toString('base64url') }
export function hashToken(value: string): string { return createHash('sha256').update(value).digest('hex') }
export function pkceChallenge(verifier: string): string { return createHash('sha256').update(verifier).digest('base64url') }
export function expiresIn(seconds: number): string { return new Date(Date.now() + seconds * 1000).toISOString() }
export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers); headers.set('cache-control','no-store'); headers.set('pragma','no-cache')
  return Response.json(data,{...init,headers})
}
export function validRedirectUri(value: string): boolean {
  if (!value || value.length > 2048) return false
  try {
    const uri = new URL(value)
    if (uri.hash || uri.username || uri.password) return false
    if (uri.protocol === 'https:') return true
    if (uri.protocol === 'http:') return ['localhost','127.0.0.1','[::1]'].includes(uri.hostname)
    return /^[a-z][a-z0-9+.-]*:$/.test(uri.protocol) && !['javascript:','data:','file:','ftp:'].includes(uri.protocol)
  } catch { return false }
}
export function parseScope(value: string | null): OAuthScope[] {
  return [...new Set((value ?? '').split(/\s+/).filter(Boolean).filter((s): s is OAuthScope => OAUTH_SCOPES.includes(s as OAuthScope)))]
}
export async function getOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const {data,error}=await admin().from('mcp_oauth_clients').select('client_id,client_name,redirect_uris,grant_types,response_types,token_endpoint_auth_method,client_metadata_url').eq('client_id',clientId).maybeSingle()
  if(error) throw new Error('OAUTH_STORE_UNAVAILABLE')
  return data as OAuthClient | null
}
export function htmlEscape(value: string): string {
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
}
export function redirectWithError(uri: string, error: string, state: string | null): Response {
  const target=new URL(uri); target.searchParams.set('error',error); if(state) target.searchParams.set('state',state); return Response.redirect(target.toString(),302)
}
export function resourceUri(request: Request): string {
  const configured=process.env.NEXT_PUBLIC_SITE_URL; const origin=configured?new URL(configured).origin:new URL(request.url).origin
  return new URL('/api/mcp',origin).toString()
}