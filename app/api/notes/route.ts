import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

interface NoteRequest {
  title?: unknown
  body?: unknown
  started_at?: unknown
}

function parseNoteInput(value: unknown): { title: string; body: string; startedAt: string | null } | null {
  if (typeof value !== 'object' || value === null) return null

  const input = value as NoteRequest
  const title = typeof input.title === 'string' ? input.title : ''
  const body = typeof input.body === 'string' ? input.body : ''
  const startedAt =
    input.started_at === null || input.started_at === undefined
      ? null
      : typeof input.started_at === 'string'
        ? input.started_at
        : null

  return { title, body, startedAt }
}

interface DocumentRow {
  id: string
  user_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  metadata: Record<string, unknown> | null
}

function toNote(row: DocumentRow) {
  const metadata = row.metadata ?? {}
  const startedAt = typeof metadata.started_at === 'string' ? metadata.started_at : null

  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    body: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: startedAt,
    history: [],
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('documents')
    .select('id,user_id,title,content,created_at,updated_at,metadata')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 })
  }

  return NextResponse.json((data as DocumentRow[]).map(toNote))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseNoteInput(payload)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid note payload' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      title: parsed.title,
      content: parsed.body,
      metadata: {
        started_at: parsed.startedAt,
      },
    })
    .select('id,user_id,title,content,created_at,updated_at,metadata')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }

  return NextResponse.json(toNote(data as DocumentRow), { status: 201 })
}
