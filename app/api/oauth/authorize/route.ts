import { admin, expiresIn, getOAuthClient, hashToken, htmlEscape, json, parseScope, pkceChallenge, randomToken, redirectWithError, resourceUri, validRedirectUri } from '@/lib/mcp/oauth'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type OAuthState = {
  request_id: string
  client_id: string
  redirect_uri: string
  scope: string
  state: string
  code_challenge: string
}

function queryForState(state: OAuthState): URLSearchParams {
  const query = new URLSearchParams()
  query.set('client_id', state.client_id)
  query.set('redirect_uri', state.redirect_uri)
  query.set('response_type', 'code')
  query.set('scope', state.scope)
  query.set('state', state.state)
  query.set('code_challenge', state.code_challenge)
  query.set('code_challenge_method', 'S256')
  return query
}

function renderLogin(state: OAuthState, csrf: string, message = ''): Response {
  const requestedScopes = parseScope(state.scope)
  const scopeText = requestedScopes.length > 0 ? requestedScopes.join(', ') : 'none'
  const hidden = queryForState(state)
  hidden.set('request_id', state.request_id)
  hidden.set('csrf', csrf)
  const fields = [...hidden.entries()]
    .map(([key, value]) => '<input type="hidden" name="' + htmlEscape(key) + '" value="' + htmlEscape(value) + '">')
    .join('')
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>Connect Notely</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f5f7;color:#1d1d1f;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(440px,calc(100% - 32px));background:#fff;padding:28px;border-radius:24px;box-shadow:0 16px 60px #0001}h1{font-size:30px;margin:0 0 8px}p{color:#6e6e73;line-height:1.5;font-size:14px}.scope{background:#f5f5f7;padding:14px;border-radius:12px;margin:18px 0}.notice{color:#b42318;background:#fff1f0;padding:10px;border-radius:10px}input[type=email],input[type=password]{display:block;width:100%;box-sizing:border-box;margin:8px 0 14px;padding:12px;border:1px solid #d2d2d7;border-radius:10px;font:inherit}label{font-size:13px;font-weight:600}.approve{display:flex;gap:8px;align-items:flex-start;margin:10px 0 16px;font-size:13px;font-weight:400}.approve input{margin-top:2px}button{width:100%;border:0;border-radius:10px;padding:13px;background:#0071e3;color:#fff;font-weight:600}</style></head><body><main class="card"><div>✦ Notely</div><h1>Connect your Notely context</h1>' +
    (message ? '<p class="notice">' + htmlEscape(message) + '</p>' : '') +
    '<p>This AI client is requesting access to your Notely account.</p><div class="scope"><strong>Requested scopes</strong><p>' + htmlEscape(scopeText) + '</p></div><form method="post">' + fields +
    '<label>Email<input name="email" type="email" autocomplete="username" required maxlength="320"></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="4096"></label><label class="approve"><input name="approve" type="checkbox" value="yes" required><span>I authorize this AI connection to access the scopes shown above.</span></label><button type="submit">Authorize securely</button></form></main></body></html>'
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}

function validateBasic(params: URLSearchParams): boolean {
  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  const state = params.get('state') ?? ''
  const challenge = params.get('code_challenge')
  return params.get('response_type') === 'code' &&
    !!clientId && clientId.length <= 200 &&
    !!redirectUri && validRedirectUri(redirectUri) &&
    !!challenge && challenge.length >= 43 && challenge.length <= 128 &&
    params.get('code_challenge_method') === 'S256' &&
    state.length <= 1024
}

async function loadRequest(request: Request, params: URLSearchParams) {
  if (!validateBasic(params)) return null
  const clientId = params.get('client_id')!
  const redirectUri = params.get('redirect_uri')!
  const client = await getOAuthClient(clientId)
  if (!client || !client.redirect_uris.includes(redirectUri) || client.token_endpoint_auth_method !== 'none') return null
  const requested = (params.get('scope') ?? '').split(/s+/).filter(Boolean)
  if (requested.some(scope => !['notes:read','notes:write','timeline:read','search:read','context:read','intelligence:read'].includes(scope))) return { invalidScope: true, redirectUri, state: params.get('state') ?? '' }
  return { clientId, redirectUri, client, scope: [...new Set(requested)].join(' '), state: params.get('state') ?? '', challenge: params.get('code_challenge')! }
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const loaded = await loadRequest(request, params).catch(() => null)
  if (!loaded) return new Response('Invalid OAuth authorization request', { status: 400 })
  if ('invalidScope' in loaded) return redirectWithError(loaded.redirectUri, 'invalid_scope', loaded.state)
  const requestId = crypto.randomUUID()
  const csrf = randomToken(24)
  const { error } = await admin().from('mcp_oauth_authorization_requests').insert({
    request_id: requestId,
    client_id: loaded.clientId,
    redirect_uri: loaded.redirectUri,
    user_id: null,
    scopes: parseScope(loaded.scope),
    resource: resourceUri(request),
    code_challenge: loaded.challenge,
    state: loaded.state,
    csrf_hash: hashToken(csrf),
    expires_at: expiresIn(600),
  })
  if (error) return new Response('Authorization service unavailable', { status: 503 })
  const state: OAuthState = {
    request_id: requestId, client_id: loaded.clientId, redirect_uri: loaded.redirectUri,
    scope: loaded.scope, state: loaded.state, code_challenge: loaded.challenge,
  }
  const response = renderLogin(state, csrf)
  response.headers.append('set-cookie', 'notely_oauth_request=' + encodeURIComponent(requestId) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600')
  return response
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null)
  if (!form) return new Response('Invalid request', { status: 400 })
  const get = (name: string): string => {
    const value = form.get(name)
    return typeof value === 'string' && value.length <= 4096 ? value : ''
  }
  const requestId = get('request_id')
  const csrf = get('csrf')
  if (!requestId || !csrf) return new Response('Invalid OAuth request', { status: 400 })
  const cookies = request.headers.get('cookie') ?? ''
  if (!cookies.split(';').some(item => item.trim() === 'notely_oauth_request=' + encodeURIComponent(requestId))) return new Response('Invalid OAuth session', { status: 400 })
  const { data: pending, error: pendingError } = await admin()
    .from('mcp_oauth_authorization_requests')
    .select('request_id,client_id,redirect_uri,scopes,resource,code_challenge,state,csrf_hash,expires_at')
    .eq('request_id', requestId)
    .maybeSingle()
  if (pendingError || !pending || new Date(pending.expires_at).getTime() <= Date.now() || hashToken(csrf) !== pending.csrf_hash) return new Response('Invalid OAuth session', { status: 400 })
  if (get('approve') !== 'yes') return redirectWithError(pending.redirect_uri, 'access_denied', pending.state)
  const supabase = await createClient()
  const email = get('email')
  const password = get('password')
  if (!email || !password) return renderLogin({
    request_id: pending.request_id, client_id: pending.client_id, redirect_uri: pending.redirect_uri,
    scope: (pending.scopes as string[]).join(' '), state: pending.state ?? '', code_challenge: pending.code_challenge
  }, csrf, 'Email and password are required.')
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError || !auth.user) return renderLogin({
    request_id: pending.request_id, client_id: pending.client_id, redirect_uri: pending.redirect_uri,
    scope: (pending.scopes as string[]).join(' '), state: pending.state ?? '', code_challenge: pending.code_challenge
  }, csrf, 'Invalid Notely email or password.')
  const code = randomToken(32)
  const { error: codeError } = await admin().from('mcp_oauth_codes').insert({
    code_hash: hashToken(code), client_id: pending.client_id, user_id: auth.user.id,
    redirect_uri: pending.redirect_uri, code_challenge: pending.code_challenge,
    scopes: pending.scopes, resource: pending.resource, expires_at: expiresIn(300),
  })
  if (codeError) return new Response('Authorization failed', { status: 500 })
  await admin().from('mcp_oauth_authorization_requests').delete().eq('request_id', requestId)
  const target = new URL(pending.redirect_uri)
  target.searchParams.set('code', code)
  if (pending.state) target.searchParams.set('state', pending.state)
  const response = Response.redirect(target.toString(), 302)
  response.headers.append('set-cookie', 'notely_oauth_request=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
  return response
}