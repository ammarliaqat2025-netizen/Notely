import { admin, hashToken, json } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function formBody(request: Request): Promise<Record<string,string> | null> {
  try {
    const form = await request.formData()
    const body: Record<string,string> = {}
    for (const [key,value] of form.entries()) if (typeof value === 'string' && value.length <= 4096) body[key]=value
    return body
  } catch { return null }
}

export async function POST(request: Request): Promise<Response> {
  const form=await formBody(request)
  if(!form?.token) return json({error:'invalid_request'},{status:400})
  try {
    const supabase=admin()
    const tokenHash=hashToken(form.token)
    const hint=form.token_type_hint
    if(hint!=='refresh_token') await supabase.from('mcp_oauth_tokens').update({revoked_at:new Date().toISOString()}).eq('token_hash',tokenHash)
    if(hint!=='access_token') await supabase.from('mcp_oauth_refresh_tokens').update({revoked_at:new Date().toISOString()}).eq('token_hash',tokenHash)
  } catch { return json({error:'server_error'},{status:500}) }
  return new Response(null,{status:200,headers:{'cache-control':'no-store'}})
}