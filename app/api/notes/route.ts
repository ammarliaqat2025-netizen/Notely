import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

interface NoteRequest {
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
  status: string
  created_at: string
  updated_at: string
}

interface VersionRow {
  document_id: string
  version_number: number
  body: string
  created_at: string
}

function parseNoteInput(value: unknown): {
  title: string
  body: string
  startedAt: string | null
} | null {
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

function toHistory(versions: VersionRow[]): { content: string; timestamp: number }[] {
  return versions
    .slice()
    .sort((a, b) => a.version_number - b.version_number)
    .map(version => ({
      content: version.body,
      timestamp: Date.parse(version.created_at),
    }))
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: documents, error: documentsError } = await supabase
    .from('documents')
    .select('id,user_id,title,body,started_at,status,created_at,updated_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  if (documentsError) {
    console.error('Failed to load notes:', documentsError)
    return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 })
  }

  const rows = (documents ?? []) as DocumentRow[]
  if (rows.length === 0) return NextResponse.json([])

  const { data: versions, error: versionsError } = await supabase
    .from('document_versions')
    .select('document_id,version_number,body,created_at')
    .in('document_id', rows.map(row => row.id))
    .order('version_number', { ascending: true })

  if (versionsError) {
    console.error('Failed to load note history:', versionsError)
    return NextResponse.json(rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
      started_at: row.started_at,
      history: [{ content: row.body, timestamp: Date.parse(row.started_at ?? row.created_at) }],
      synced: true,
    })))
  }

  const byDocument = new Map<string, VersionRow[]>()
  for (const version of (versions ?? []) as VersionRow[]) {
    const existing = byDocument.get(version.document_id) ?? []
    existing.push(version)
    byDocument.set(version.document_id, existing)
  }

  return NextResponse.json(rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    history: byDocument.get(row.id)?.length
      ? toHistory(byDocument.get(row.id)!)
      : [{ content: row.body, timestamp: Date.parse(row.started_at ?? row.created_at) }],
    synced: true,
  })))
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
      body: parsed.body,
      started_at: parsed.startedAt,
    })
    .select('id,user_id,title,body,started_at,status,created_at,updated_at')
    .single()

  if (error || !data) {
    console.error('Failed to create note:', error)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }

  const document = data as DocumentRow
  const { error: versionError } = await supabase
    .from('document_versions')
    .insert({
      document_id: document.id,
      version_number: 1,
      title: document.title,
      body: document.body,
    })

  if (versionError) {
    console.error('Failed to create initial note version:', versionError)
  }

  return NextResponse.json({
    id: document.id,
    user_id: document.user_id,
    title: document.title,
    body: document.body,
    created_at: document.created_at,
    updated_at: document.updated_at,
    started_at: document.started_at,
    history: [{ content: document.body, timestamp: Date.parse(document.started_at ?? document.created_at) }],
    synced: true,
  }, { status: 201 })
}
