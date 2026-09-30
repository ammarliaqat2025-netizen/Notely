import { admin, json, randomToken, validRedirectUri } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RegistrationBody = {
  client_name?: unknown
  redirect_uris?: unknown
  grant_types?: unknown
  response_types?: unknown
  token_endpoint_auth_method?: unknown
  client_metadata_url?: unknown
}

function stringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string').map(entry => entry.trim()).filter(Boolean).slice(0, max)
}

export async function POST(request: Request): Promise<Response> {
  let body: RegistrationBody
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'invalid_client_metadata' }, { status: 400 })
    body = parsed as RegistrationBody
  } catch { return json({ error: 'invalid_client_metadata' }, { status: 400 }) }

  const redirectUris = stringArray(body.redirect_uris, 20)
  if (!redirectUris.length || redirectUris.some(uri => !validRedirectUri(uri))) return json({ error: 'invalid_redirect_uri' }, { status: 400 })
  if (body.grant_types !== undefined && stringArray(body.grant_types, 10).some(type => !['authorization_code','refresh_token'].includes(type))) return json({ error: 'invalid_client_metadata' }, { status: 400 })
  if (body.response_types !== undefined && stringArray(body.response_types, 5).some(type => type !== 'code')) return json({ error: 'invalid_client_metadata' }, { status: 400 })
  if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== 'none') return json({ error: 'invalid_client_metadata' }, { status: 400 })

  const clientId = `notely_${randomToken(18)}`
  const clientName = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0,120) : 'MCP Client'
  const clientMetadataUrl = typeof body.client_metadata_url === 'string' && body.client_metadata_url.startsWith('https://') ? body.client_metadata_url.slice(0,2048) : null

  try {
    const { error } = await admin().from('mcp_oauth_clients').insert({
      client_id: clientId, client_name: clientName, redirect_uris: redirectUris,
      grant_types: ['authorization_code','refresh_token'], response_types: ['code'],
      token_endpoint_auth_method: 'none', client_metadata_url: clientMetadataUrl,
    })
    if (error) return json({ error: 'server_error' }, { status: 500 })
  } catch { return json({ error: 'server_error' }, { status: 500 }) }

  return json({
    client_id: clientId, client_id_issued_at: Math.floor(Date.now()/1000), client_name: clientName,
    redirect_uris: redirectUris, grant_types: ['authorization_code','refresh_token'],
    response_types: ['code'], token_endpoint_auth_method: 'none',
  }, { status: 201 })
}