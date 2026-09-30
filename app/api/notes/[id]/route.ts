import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

interface NoteUpdateRequest {
  title?: unknown
  body?: unknown
  started_at?: unknown
}

function parseId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function parseUpdate(value: unknown): {
  title?: string
  body?: string
  startedAt?: string | null
} | null {
  if (typeof value !== 'object' || value === null) return null

  const input = value as NoteUpdateRequest
  const result: { title?: string; body?: string; startedAt?: string | null } = {}

  if (input.title !== undefined) {
    if (typeof input.title !== 'string') return null
    result.title = input.title
  }

  if (input.body !== undefined) {
    if (typeof input.body !== 'string') return null
    result.body = input.body
  }

  if (input.started_at !== undefined) {
    if (input.started_at !== null && typeof input.started_at !== 'string') return null
    result.startedAt = input.started_at as string | null
  }

  return result
}

function normalizeNote(data: {
  id: string
  user_id: string
  title: string
  body: string
  started_at: string | null
  created_at: string
  updated_at: string
}) {
  return {
    ...data,
    history: [],
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: rawId } = await params
  const id = parseId(rawId)

  if (!id) {
    return NextResponse.json({ error: 'Invalid note id' }, { status: 400 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseUpdate(payload)
  if (!parsed || Object.keys(parsed).length === 0) {
    return NextResponse.json({ error: 'No valid changes supplied' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (parsed.title !== undefined) updates.title = parsed.title
  if (parsed.body !== undefined) updates.body = parsed.body
  if (parsed.startedAt !== undefined) updates.started_at = parsed.startedAt

  const { data, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id,user_id,title,body,started_at,created_at,updated_at')
    .single()

  if (error || !data) {
    console.error('Failed to update note:', error)
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })
  }

  return NextResponse.json(normalizeNote(data))
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: rawId } = await params
  const id = parseId(rawId)

  if (!id) {
    return NextResponse.json({ error: 'Invalid note id' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('documents')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .select('id')
    .single()

  if (error || !data) {
    console.error('Failed to archive note:', error)
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
