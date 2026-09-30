import { admin, expiresIn, getOAuthClient, hashToken, json, pkceChallenge, randomToken, resourceUri } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function formBody(request: Request): Promise<Record<string,string> | null> {
  try {
    const form = await request.formData()
    const body: Record<string,string> = {}
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string' && value.length <= 4096) body[key] = value
    }
    return body
  } catch { return null }
}

function tokenResponse(accessToken: string, refreshToken: string, scopes: string[]): Response {
  return json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, scope: scopes.join(' '), refresh_token: refreshToken })
}

export async function POST(request: Request): Promise<Response> {
  const form = await formBody(request)
  if (!form || !form.client_id) return json({ error:'invalid_request' }, { status:400 })

  let supabase
  try { supabase = admin() } catch { return json({ error:'server_error' }, { status:500 }) }

  const client = await getOAuthClient(form.client_id).catch(() => null)
  if (!client || client.token_endpoint_auth_method !== 'none') return json({ error:'invalid_client' }, { status:401 })

  if (form.grant_type === 'refresh_token') {
    const refresh = form.refresh_token
    if (!refresh) return json({ error:'invalid_request' }, { status:400 })
    const accessToken = randomToken(32)
    const nextRefresh = randomToken(32)
    const { data, error } = await supabase.rpc('mcp_rotate_refresh_token', {
      p_refresh_token_hash: hashToken(refresh),
      p_client_id: form.client_id,
      p_new_access_token_hash: hashToken(accessToken),
      p_new_refresh_token_hash: hashToken(nextRefresh),
      p_access_expires_at: expiresIn(3600),
      p_refresh_expires_at: expiresIn(2592000),
    })
    if (error || !data) return json({ error:'invalid_grant' }, { status:400 })
    const scopes = Array.isArray((data as {scopes?:unknown}).scopes) ? (data as {scopes:string[]}).scopes : []
    return tokenResponse(accessToken, nextRefresh, scopes)
  }

  if (form.grant_type !== 'authorization_code') return json({ error:'unsupported_grant_type' }, { status:400 })

  const code = form.code
  const redirectUri = form.redirect_uri
  const verifier = form.code_verifier
  if (!code || !redirectUri || !verifier || verifier.length > 512) return json({ error:'invalid_request' }, { status:400 })
  if (!client.redirect_uris.includes(redirectUri)) return json({ error:'invalid_grant' }, { status:400 })

  const codeHash = hashToken(code)
  const { data: authCode, error } = await supabase
    .from('mcp_oauth_codes')
    .select('code_hash,client_id,user_id,redirect_uri,code_challenge,scopes,resource,expires_at,used_at')
    .eq('code_hash', codeHash)
    .maybeSingle()
  if (error || !authCode) return json({ error:'invalid_grant' }, { status:400 })
  if (authCode.used_at || new Date(authCode.expires_at).getTime() <= Date.now()) return json({ error:'invalid_grant' }, { status:400 })
  if (authCode.client_id !== form.client_id || authCode.redirect_uri !== redirectUri || authCode.resource !== resourceUri(request)) return json({ error:'invalid_grant' }, { status:400 })
  if (pkceChallenge(verifier) !== authCode.code_challenge) return json({ error:'invalid_grant' }, { status:400 })

  const accessToken = randomToken(32)
  const refreshToken = randomToken(32)
  const { data: exchanged, error: exchangeError } = await supabase.rpc('mcp_exchange_authorization_code', {
    p_code_hash: codeHash,
    p_client_id: form.client_id,
    p_redirect_uri: redirectUri,
    p_code_challenge: authCode.code_challenge,
    p_resource: authCode.resource,
    p_access_token_hash: hashToken(accessToken),
    p_refresh_token_hash: hashToken(refreshToken),
    p_access_expires_at: expiresIn(3600),
    p_refresh_expires_at: expiresIn(2592000),
  })
  if (exchangeError || !exchanged) return json({ error:'invalid_grant' }, { status:400 })
  const scopes = Array.isArray((exchanged as {scopes?:unknown}).scopes) ? (exchanged as {scopes:string[]}).scopes : []
  return tokenResponse(accessToken, refreshToken, scopes)
}