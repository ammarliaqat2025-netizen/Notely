import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

interface NoteUpdateRequest {
  title?: unknown
  body?: unknown
  started_at?: unknown
}

interface DocumentRow {
  id: string
  user_id: string
  title: string
  body: string
  started_at: string | null
  created_at: string
  updated_at: string
}

interface VersionRow {
  version_number: number
  title: string
  body: string
  created_at: string
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

function toHistory(versions: VersionRow[], fallback: string, fallbackTimestamp: string | null) {
  if (versions.length > 0) {
    return versions
      .slice()
      .sort((a, b) => a.version_number - b.version_number)
      .map(version => ({
        content: version.body,
        timestamp: Date.parse(version.created_at),
      }))
  }

  return [{ content: fallback, timestamp: Date.parse(fallbackTimestamp ?? new Date().toISOString()) }]
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

  const { data: before, error: beforeError } = await supabase
    .from('documents')
    .select('id,user_id,title,body,started_at,created_at,updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (beforeError || !before) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
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

  const document = data as DocumentRow
  const bodyChanged = document.body !== (before as DocumentRow).body

  {
    const { data: latestVersion, error: versionLookupError } = await supabase
      .from('document_versions')
      .select('version_number,title,body')
      .eq('document_id', document.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (versionLookupError) {
      console.error('Failed to read note version sequence:', versionLookupError)
      return NextResponse.json({ error: 'Note saved but version history could not be verified' }, { status: 500 })
    }

    const latest = latestVersion as { version_number: number; title: string; body: string } | null
    // Recover a version write that failed after the document update succeeded.
    if (bodyChanged || latest?.body !== document.body) {
      const nextVersion = (latest?.version_number ?? 0) + 1
      const { error: versionError } = await supabase
        .from('document_versions')
        .insert({
          document_id: document.id,
          version_number: nextVersion,
          title: document.title,
          body: document.body,
        })

      if (versionError) {
        console.error('Failed to persist note version:', versionError)
        return NextResponse.json({ error: 'Note saved but version history could not be persisted' }, { status: 500 })
      }
    }
  }

  const { data: versions } = await supabase
    .from('document_versions')
    .select('version_number,title,body,created_at')
    .eq('document_id', document.id)
    .order('version_number', { ascending: true })

  return NextResponse.json({
    id: document.id,
    user_id: document.user_id,
    title: document.title,
    body: document.body,
    created_at: document.created_at,
    updated_at: document.updated_at,
    started_at: document.started_at,
    history: toHistory(
      (versions ?? []) as VersionRow[],
      document.body,
      document.started_at ?? document.created_at
    ),
    synced: true,
  })
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
