import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// Fetch notes for the logged-in user
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Create a new note
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('notes')
    .insert({ user_id: user.id, title: body.title || '', body: body.body || '' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Summarize a note using DeepSeek
export async function PUT(request: Request) {
  const { title, body } = await request.json()
  if (!body?.trim()) return NextResponse.json({ error: 'No content' }, { status: 400 })

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY!}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{
        role: 'user',
        content: `Summarize this note in 2-3 clear sentences. Capture key points only. No preamble, just the summary.\n\nTitle: ${title}\n\nContent:\n${body}`
      }],
      max_tokens: 300
    })
  })

  const data = await response.json()
  const summary = data.choices?.[0]?.message?.content || 'Could not generate summary.'
  return NextResponse.json({ summary })
}
