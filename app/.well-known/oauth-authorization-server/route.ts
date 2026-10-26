export const runtime = 'nodejs'
export const dynamic = 'force-static'

export async function GET(request: Request): Promise<Response> {
  // Static generation receives localhost:3000 as the build-time request origin.
  // Prefer the environment-specific canonical site URL so OAuth discovery never
  // publishes localhost endpoints in production or preview deployments.
  const origin = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
    : new URL(request.url).origin

  return Response.json({
    issuer: origin,
    authorization_endpoint: origin + '/api/oauth/authorize',
    token_endpoint: origin + '/api/oauth/token',
    revocation_endpoint: origin + '/api/oauth/revoke',
    registration_endpoint: origin + '/api/oauth/register',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code','refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['notes:read','notes:write','timeline:read','search:read','context:read','intelligence:read'],
  }, {headers:{'cache-control':'public,max-age=300,s-maxage=300'}})
}
