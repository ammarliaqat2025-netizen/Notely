export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin
  const resource = new URL('/api/mcp', origin).toString()
  return Response.json({
    resource,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['notes:read','notes:write','timeline:read','search:read','context:read','intelligence:read'],
  }, { headers: { 'cache-control': 'public, max-age=300, s-maxage=300' } })
}