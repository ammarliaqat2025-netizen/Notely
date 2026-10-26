'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { User } from '@supabase/supabase-js'

interface NoteVersion { content: string; timestamp: number }

interface Note {
  id: string
  user_id?: string
  title: string
  body: string
  created_at: string
  updated_at: string
  started_at?: string
  history?: NoteVersion[]
  synced?: boolean
  creationKey?: string
}

function fmtDate(iso: string) {
  const d = new Date(iso), diff = Date.now() - d.getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
}
function fmtFull(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}
function fmtShortTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
}

function toTimestampMs(iso: string | null | undefined) {
  if (!iso) return null
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : null
}

const GUEST_KEY = 'notely_notes'
function loadGuest(): Note[] {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]') } catch { return [] }
}
function saveGuest(n: Note[]) { localStorage.setItem(GUEST_KEY, JSON.stringify(n)) }

function exportTxt(title: string, body: string, startedAt: string | null) {
  const ts = startedAt ? `Started: ${fmtFull(startedAt)}\n\n` : ''
  const content = `${title || 'Untitled'}\n${'─'.repeat(40)}\n${ts}${body}`
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(title || 'note').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

// ── OUTSIDE COMPONENT ──

interface NotesListProps {
  notes: Note[]
  activeId: string | null
  onOpen: (n: Note) => void
  onDelete: (id: string, e: React.MouseEvent) => void
  className?: string
}

function NotesList({ notes, activeId, onOpen, onDelete, className }: NotesListProps) {
  return (
    <div className={className}>
      {notes.length === 0
        ? <div className="empty-list">No notes yet.<br />Hit + to begin.</div>
        : notes.map(n => (
          <div key={n.id} className={`note-item ${n.id === activeId ? 'active' : ''}`} onClick={() => onOpen(n)}>
            <div className="note-item-title">{n.title || 'Untitled'}</div>
            <div className="note-item-preview">{n.body.slice(0, 60) || '—'}</div>
            <div className="note-item-date">
              {n.started_at && <span style={{ marginRight: 6 }}>⏱ {fmtTime(n.started_at)}</span>}
              {fmtDate(n.updated_at)}
            </div>
            <button className="note-del" onClick={e => onDelete(n.id, e)} title="Delete">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))
      }
    </div>
  )
}

interface EditorProps {
  activeId: string | null
  title: string
  body: string
  startedAt: string | null
  saveStatus: 'saved' | 'saving' | 'error'
  wordCount: number
  aiStatus: string
  history: NoteVersion[]
  travelIndex: number
  onTitleChange: (v: string) => void
  onBodyChange: (v: string) => void
  onTitleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onDelete: (id: string, e: React.MouseEvent) => void
  onSummarize: () => void
  onExport: () => void
  onTravel: (idx: number) => void
  onRestoreVersion: () => void
  bodyRef: React.RefObject<HTMLTextAreaElement | null>
  titleRef: React.RefObject<HTMLTextAreaElement | null>
}

function Editor({
  activeId, title, body, startedAt, saveStatus, wordCount, aiStatus,
  history, travelIndex,
  onTitleChange, onBodyChange, onTitleKeyDown, onDelete,
  onSummarize, onExport, onTravel, onRestoreVersion,
  bodyRef, titleRef
}: EditorProps) {
  if (!activeId) {
    return (
      <div className="empty-editor">
        <svg width="48" height="48" viewBox="0 0 52 52" fill="none">
          <rect x="10" y="8" width="32" height="36" rx="3" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M17 18h18M17 24h18M17 30h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <p>Select a note or create one</p>
      </div>
    )
  }

  const displayBody = travelIndex >= 0 && history[travelIndex]
    ? history[travelIndex].content
    : body

  return (
    <div className="editor-wrap">
      <div className="toolbar">
        <button className="tool-btn" title="Delete note" onClick={e => onDelete(activeId, e)}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 3.5h9M5 3.5V2.5h3v1M5.5 6v4M7.5 6v4M3 3.5l.7 7h5.6l.7-7"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="tool-sep" />
        <button className="tool-btn ai-btn" title="Summarize with AI" onClick={onSummarize} disabled={!body.trim()}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1.5l1 2.5h2.5l-2 1.5.8 2.5-2.3-1.5-2.3 1.5.8-2.5-2-1.5H5.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            <path d="M2 10h9M3.5 12h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span>Summarize</span>
        </button>
        <button className="tool-btn ai-btn" title="Export as .txt" onClick={onExport}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M8 1.5H4a1 1 0 00-1 1v8a1 1 0 001 1h5a1 1 0 001-1V4.5L8 1.5z" stroke="currentColor" strokeWidth="1.1"/>
            <path d="M8 1.5V4.5H11M4.5 7h4M4.5 9h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
          <span>Export</span>
        </button>
        <div className="tool-sep" />
        <span className="word-count" style={{ marginLeft: 'auto' }}>{wordCount}w</span>
        <span className={`save-status ${saveStatus}`} aria-live="polite">
          {saveStatus === 'saved' ? '● saved' : saveStatus === 'error' ? '● save failed' : '○ saving…'}
        </span>
      </div>

      {aiStatus && <div className="ai-status-bar">{aiStatus}</div>}
      <div className="note-timestamp" aria-label="Capture timestamp">
        <span className="note-timestamp-label">Captured</span>
        <strong>{fmtTime(startedAt || new Date().toISOString())}</strong>
        <span>· {fmtFull(startedAt || new Date().toISOString())}</span>
      </div>

      <textarea
        ref={titleRef}
        className="note-title"
        placeholder="Untitled"
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        onKeyDown={onTitleKeyDown}
        rows={1}
      />
      <textarea
        ref={bodyRef}
        className="note-body"
        placeholder="Start writing…"
        value={displayBody}
        onChange={e => {
          if (travelIndex >= 0) onTravel(-1)
          onBodyChange(e.target.value)
        }}
      />

      {history.length > 0 && (
        <div className="time-travel-bar">
          <span className="tt-label">Time Travel</span>
          <input
            type="range"
            className="tt-scrubber"
            min={0}
            max={Math.max(0, history.length - 1)}
            value={travelIndex >= 0 ? travelIndex : Math.max(0, history.length - 1)}
            onChange={e => onTravel(parseInt(e.target.value))}
            aria-label="Time travel history"
          />
          <span className="tt-time">
            {travelIndex >= 0 && history[travelIndex]
              ? fmtShortTime(history[travelIndex].timestamp)
              : history.length === 1
                ? 'Captured'
                : fmtShortTime(history[history.length - 1]?.timestamp || Date.now())}
          </span>
          {travelIndex >= 0 && travelIndex < history.length - 1 && (
            <button className="tt-restore" onClick={onRestoreVersion}>Restore</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── MAIN COMPONENT ──

export default function NotelyApp() {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [history, setHistory] = useState<NoteVersion[]>([])
  const [travelIndex, setTravelIndex] = useState(-1)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [wordCount, setWordCount] = useState(0)
  const [aiStatus, setAiStatus] = useState('')
  const [search, setSearch] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [showModal, setShowModal] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list')

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const userRef = useRef<User | null>(null)
  const startedAtRef = useRef<string | null>(null)
  const notesRef = useRef<Note[]>([])
  const localWriteRef = useRef<string | null>(null)
  const saveSequenceRef = useRef(0)
  const saveQueueRef = useRef<Map<string, Promise<void>>>(new Map())
  const activeDraftRef = useRef({ title: '', body: '' })
  const creationInFlightRef = useRef(false)
  const dirtyFieldsRef = useRef({ title: false, body: false })

  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { startedAtRef.current = startedAt }, [startedAt])
  useEffect(() => { notesRef.current = notes }, [notes])
  useEffect(() => { activeDraftRef.current = { title, body } }, [title, body])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      fetchCloud()
    } else {
      const gn = loadGuest()
      setNotes(gn)
      if (gn.length > 0) openNote(gn[0])
      else clearEditor()
    }
  }, [user])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`documents:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `user_id=eq.${user.id}`,
        },
        payload => {
          const row = payload.new as Partial<Note> & { status?: string }
          if (!row.id) return

          if (payload.eventType === 'DELETE' || row.status === 'archived') {
            setNotes(prev => prev.filter(note => note.id !== row.id))
            if (activeIdRef.current === row.id) {
              clearEditor()
              setMobileView('list')
            }
            return
          }

          const incoming: Note = {
            id: row.id,
            user_id: row.user_id,
            title: row.title ?? '',
            body: row.body ?? '',
            created_at: row.created_at ?? new Date().toISOString(),
            updated_at: row.updated_at ?? new Date().toISOString(),
            started_at: row.started_at ?? undefined,
          }

          if (localWriteRef.current === row.id) {
            localWriteRef.current = null
            return
          }

          setNotes(prev => {
            const exists = prev.some(note => note.id === row.id)
            return exists
              ? prev.map(note => note.id === row.id ? { ...note, ...incoming, synced: true } : note)
              : [incoming, ...prev]
          })

          if (activeIdRef.current === row.id && !dirtyFieldsRef.current.title && !dirtyFieldsRef.current.body && saveStatus !== 'saving') {
            setActiveId(row.id)
            activeIdRef.current = row.id
            setTitle(incoming.title)
            setBody(incoming.body)
            activeDraftRef.current = { title: incoming.title, body: incoming.body }
            startedAtRef.current = incoming.started_at ?? null
            setStartedAt(incoming.started_at ?? null)
            setHistory(prev => {
              const timestamp = Date.parse(incoming.updated_at)
              const last = prev[prev.length - 1]
              if (last?.content === incoming.body) return prev
              return [...prev, { content: incoming.body, timestamp }]
            })
            setWordCount(incoming.body.trim() ? incoming.body.trim().split(/\s+/).length : 0)
            setSaveStatus('saved')
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user])

  function clearEditor() {
    activeIdRef.current = null
    startedAtRef.current = null
    setActiveId(null); setTitle(''); setBody(''); setStartedAt(null)
    setWordCount(0); setAiStatus(''); setHistory([]); setTravelIndex(-1)
  }

  async function fetchCloud() {
    const res = await fetch('/api/notes', { cache: 'no-store' })
    if (!res.ok) return
    const data: Note[] = await res.json()
    setNotes(data.map(note => ({ ...note, synced: true })))
    if (data.length > 0) openNote(data[0])
    else clearEditor()
  }

  function openNote(note: Note) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (historyTimer.current) { clearTimeout(historyTimer.current); historyTimer.current = null }
    saveSequenceRef.current++
    dirtyFieldsRef.current = { title: false, body: false }
    activeIdRef.current = note.id
    startedAtRef.current = note.started_at || null
    setActiveId(note.id)
    setTitle(note.title)
    setBody(note.body)
    activeDraftRef.current = { title: note.title, body: note.body }
    setStartedAt(note.started_at || null)
    setWordCount(note.body.trim() ? note.body.trim().split(/\s+/).length : 0)
    const capturedAt = toTimestampMs(note.started_at)
    setHistory(note.history?.length ? note.history : [{
      content: note.body,
      timestamp: capturedAt ?? toTimestampMs(note.created_at) ?? Date.now(),
    }])
    setTravelIndex(-1)
    setSaveStatus('saved')
    setAiStatus('')
    setSidebarOpen(false)
    setMobileView('editor')
  }

  // ── INSTANT NEW NOTE ──
  async function newNote() {
    if (creationInFlightRef.current) return
    creationInFlightRef.current = true
    const retryDraft = userRef.current && saveStatus === 'error'
      ? notesRef.current.find(note => note.id === activeIdRef.current && note.id.startsWith('temp-') && note.creationKey)
      : undefined
    const now = retryDraft?.started_at ?? new Date().toISOString()
    const creationKey = retryDraft?.creationKey ?? crypto.randomUUID()
    const tempId = retryDraft?.id ?? `temp-${creationKey}`
    const captureTimestamp = Date.now()
    activeIdRef.current = tempId
    startedAtRef.current = now
    const tempNote: Note = retryDraft ?? {
      id: tempId,
      creationKey,
      title: '',
      body: '',
      created_at: now,
      updated_at: now,
      started_at: now,
      history: [{ content: '', timestamp: captureTimestamp }],
      synced: false,
    }
    if (!retryDraft) {
      const updated = [tempNote, ...notesRef.current]
      notesRef.current = updated
      setNotes(updated)
      openNote(tempNote)
      if (!userRef.current) saveGuest(updated)
      setTimeout(() => titleRef.current?.focus(), 50)
    }

    if (userRef.current) {
      try {
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: creationKey, title: '', body: '', started_at: now })
        })
        if (!res.ok) throw new Error('Failed to create note')
        {
          const cloud: Note = await res.json()
          const currentDraft = notesRef.current.find(note => note.id === tempId) ?? tempNote
          const draftTitle = activeIdRef.current === tempId
            ? activeDraftRef.current.title
            : currentDraft.title
          const draftBody = activeIdRef.current === tempId
            ? activeDraftRef.current.body
            : currentDraft.body
          const draftStartedAt = currentDraft.started_at ?? cloud.started_at ?? now
          const stillActive = activeIdRef.current === tempId

          const mappedNotes = notesRef.current.map(note =>
            note.id === tempId
              ? { ...cloud, title: draftTitle, body: draftBody, started_at: draftStartedAt, history: currentDraft.history, synced: true }
              : note
          )
          notesRef.current = mappedNotes
          setNotes(mappedNotes)

          if (stillActive) {
            activeIdRef.current = cloud.id
            startedAtRef.current = draftStartedAt
            setActiveId(cloud.id)
            setStartedAt(draftStartedAt)
          }

          if (draftTitle || draftBody) {
            localWriteRef.current = cloud.id
            try {
              const draftRes = await fetch('/api/notes/' + cloud.id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: draftTitle, body: draftBody, started_at: draftStartedAt }),
              })
              if (!draftRes.ok) throw new Error('Failed to save initial draft')
            } finally {
              localWriteRef.current = null
            }
          }
        }
      } catch {
        setSaveStatus('error')
      } finally {
        creationInFlightRef.current = false
      }
    } else {
      creationInFlightRef.current = false
    }
  }

  const doSave = useCallback(async (id: string, t: string, b: string, sa: string | null) => {
    if (!id || id.startsWith('temp-')) return

    const sequence = ++saveSequenceRef.current
    const now = new Date().toISOString()

    if (userRef.current) {
      const previousSave = saveQueueRef.current.get(id) ?? Promise.resolve()
      const queuedSave = previousSave.catch(() => undefined).then(async () => {
        localWriteRef.current = id
        try {
          const response = await fetch('/api/notes/' + id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: t, body: b, started_at: sa })
          })
          if (!response.ok) throw new Error('Note save failed')
        } finally {
          if (localWriteRef.current === id) localWriteRef.current = null
        }
      })
      saveQueueRef.current.set(id, queuedSave)

      try {
        await queuedSave
      } catch {
        if (sequence === saveSequenceRef.current && activeIdRef.current === id) setSaveStatus('error')
        return
      } finally {
        if (saveQueueRef.current.get(id) === queuedSave) saveQueueRef.current.delete(id)
      }

      if (sequence !== saveSequenceRef.current || activeIdRef.current !== id) return
    }

    const currentDraft = activeIdRef.current === id ? activeDraftRef.current : { title: t, body: b }
    setNotes(prev => {
      const updated = prev.map(n =>
        n.id === id
          ? {
              ...n,
              title: currentDraft.title,
              body: currentDraft.body,
              started_at: sa ?? undefined,
              updated_at: now,
              synced: Boolean(userRef.current),
            }
          : n
      )
      notesRef.current = updated
      if (!userRef.current) saveGuest(updated)
      return updated
    })

    if (activeDraftRef.current.title === t) dirtyFieldsRef.current.title = false
    if (activeDraftRef.current.body === b) dirtyFieldsRef.current.body = false
    if (activeDraftRef.current.title === t && activeDraftRef.current.body === b) setSaveStatus('saved')
  }, [])

  function scheduleSave(t: string, b: string, sa: string | null) {
    const id = activeIdRef.current
    if (!id) return
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void doSave(id, t, b, sa) }, 300)
  }

  function addToHistory(b: string) {
    if (historyTimer.current) clearTimeout(historyTimer.current)
    historyTimer.current = setTimeout(() => {
      setHistory(prev => {
        const last = prev[prev.length - 1]
        if (last?.content === b) return prev
        return [...prev, { content: b, timestamp: Date.now() }]
      })
    }, 2000)
  }

  function onTitleChange(v: string) {
    let sa = startedAtRef.current
    if (!sa) {
      sa = new Date().toISOString()
      startedAtRef.current = sa
      setStartedAt(sa)
    }
    setTitle(v)
    dirtyFieldsRef.current.title = true
    activeDraftRef.current.title = v
    const currentId = activeIdRef.current
    if (currentId) {
      const updated = notesRef.current.map(note => note.id === currentId ? { ...note, title: v } : note)
      notesRef.current = updated
      setNotes(updated)
    }
    scheduleSave(v, activeDraftRef.current.body, sa)
  }

  function onBodyChange(v: string) {
    let sa = startedAtRef.current
    if (!sa) {
      sa = new Date().toISOString()
      startedAtRef.current = sa
      setStartedAt(sa)
    }
    setBody(v)
    dirtyFieldsRef.current.body = true
    activeDraftRef.current.body = v
    const currentId = activeIdRef.current
    if (currentId) {
      const updated = notesRef.current.map(note => note.id === currentId ? { ...note, body: v } : note)
      notesRef.current = updated
      setNotes(updated)
    }
    setWordCount(v.trim() ? v.trim().split(/\s+/).length : 0)
    scheduleSave(activeDraftRef.current.title, v, sa)
    addToHistory(v)
    setTravelIndex(-1)
  }

  function onTravel(idx: number) {
    if (history.length === 0) return
    setTravelIndex(Math.max(0, Math.min(idx, history.length - 1)))
  }

  function onRestoreVersion() {
    if (travelIndex < 0 || !history[travelIndex]) return
    const restored = history[travelIndex].content
    setBody(restored)
    activeDraftRef.current.body = restored
    setTravelIndex(-1)
    scheduleSave(activeDraftRef.current.title, restored, startedAtRef.current)
    addToHistory(restored)
  }

  const onTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus() }
  }, [])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const wasActive = activeIdRef.current === id
    const previousNotes = notesRef.current
    const deletedNote = previousNotes.find(note => note.id === id)
    if (!deletedNote) return

    const updated = previousNotes.filter(note => note.id !== id)

    // Optimistic UI: remove immediately and move the editor without waiting on the network.
    notesRef.current = updated
    setNotes(updated)
    if (!userRef.current) saveGuest(updated)

    if (wasActive) {
      if (updated.length > 0) openNote(updated[0])
      else {
        clearEditor()
        setMobileView('list')
      }
    }

    if (!userRef.current || id.startsWith('temp-')) return

    try {
      const response = await fetch(`/api/notes/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Delete failed')
    } catch (error) {
      console.error('Failed to delete note:', error)

      // Roll back only if the note was not replaced by a newer local state.
      setNotes(current => {
        const restored = current.some(note => note.id === id)
          ? current
          : [...current, deletedNote]
        notesRef.current = restored
        return restored
      })

      if (wasActive && activeIdRef.current !== id) {
        openNote(deletedNote)
      }
    }
  }, [])

  async function handleSummarize() {
    if (!body.trim()) return
    setAiStatus('✦ Summarizing…')
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body })
      })
      const data = await response.json()
      const summary = data.summary || 'Could not generate summary.'
      const newBody = body + '\n\n─── AI Summary ───\n' + summary
      setBody(newBody)
      setWordCount(newBody.trim().split(/\s+/).length)
      scheduleSave(title, newBody, startedAt)
      addToHistory(newBody)
      setAiStatus('✦ Summary added below your note')
      setTimeout(() => setAiStatus(''), 3000)
    } catch {
      setAiStatus('✦ Could not connect. Try again.')
      setTimeout(() => setAiStatus(''), 3000)
    }
  }

  function handleExport() { exportTxt(title, body, startedAt) }

  async function handleAuth() {
    setAuthError(''); setAuthLoading(true)
    let error
    if (authMode === 'signup') {
      ;({ error } = await supabase.auth.signUp({ email, password }))
    } else {
      ;({ error } = await supabase.auth.signInWithPassword({ email, password }))
    }
    setAuthLoading(false)
    if (error) { setAuthError(error.message); return }
    setShowModal(false); setEmail(''); setPassword('')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setNotes(loadGuest()); clearEditor(); setMobileView('list')
  }

  const handleOpen = useCallback((n: Note) => openNote(n), [])

  const filteredNotes = notes.filter(n =>
    !search || n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.body.toLowerCase().includes(search.toLowerCase())
  )

  const editorProps = {
    activeId, title, body, startedAt, saveStatus, wordCount, aiStatus,
    history, travelIndex,
    onTitleChange, onBodyChange, onTitleKeyDown, onDelete: handleDelete,
    onSummarize: handleSummarize, onExport: handleExport,
    onTravel, onRestoreVersion,
    bodyRef, titleRef
  }

  return (
    <>
      {/* MOBILE HEADER */}
      <div className="mobile-header">
        {mobileView === 'list' ? (
          <>
            <div className="mobile-header-brand">Notely<span>.</span></div>
            <div style={{ display: 'flex', gap: 2 }}>
              <button className="mobile-btn" onClick={() => setShowModal(true)}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M3 17c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
              <button className="mobile-btn" onClick={newNote}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="mobile-back-btn" onClick={() => {
              if (saveTimer.current) {
                clearTimeout(saveTimer.current)
                saveTimer.current = null
                const id = activeIdRef.current
                if (id) void doSave(id, title, body, startedAt)
              }
              setMobileView('list')
            }}>
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                <path d="M11 3.5L6 8.5l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Notes
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className={`save-status ${saveStatus}`} style={{ fontSize: 10 }}>
                {saveStatus === 'saved' ? '● saved' : '○ saving…'}
              </span>
              {activeId && (
                <button className="mobile-btn" onClick={e => { handleDelete(activeId, e); setMobileView('list') }}>
                  <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                    <path d="M3 5h11M6.5 5V4h4v1M7 8v5M10 8v5M3.5 5l1 9h7l1-9"
                      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="app">
        <div className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />

        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="brand">Notely<span className="brand-dot">.</span></div>
            <div className="brand-sub">just write — nothing else</div>
            <button className="new-btn" onClick={newNote}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              New note
            </button>
          </div>
          <div className="search-wrap">
            <input
              className="search-input"
              placeholder="Search notes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="notes-count">
            {filteredNotes.length > 0 ? `${filteredNotes.length} note${filteredNotes.length !== 1 ? 's' : ''}` : ''}
          </div>
          <NotesList notes={filteredNotes} activeId={activeId} onOpen={handleOpen} onDelete={handleDelete} className="notes-list" />
          <div className="sidebar-footer">
            <div className="user-badge">
              {user ? <span className="user-email">{user.email?.split('@')[0]}</span> : 'guest mode'}
            </div>
            {user
              ? <button className="auth-btn" onClick={signOut}>sign out</button>
              : <button className="auth-btn" onClick={() => setShowModal(true)}>sign in</button>
            }
          </div>
        </aside>

        <main className="editor-area">
          {mobileView === 'list' && (
            <>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', background: 'var(--paper)', flexShrink: 0 }}>
                <input
                  className="search-input"
                  placeholder="Search notes…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <NotesList notes={filteredNotes} activeId={activeId} onOpen={handleOpen} onDelete={handleDelete} className="mobile-notes-panel" />
            </>
          )}
          {mobileView === 'editor' && (
            <div className="mobile-editor">
              <Editor {...editorProps} />
            </div>
          )}
          <div className="desktop-editor">
            <Editor {...editorProps} />
          </div>
        </main>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            <div className="modal-title">Welcome back.</div>
            <div className="modal-sub">Your notes, wherever you are.</div>
            <div className="modal-tabs">
              <button className={`modal-tab ${authMode === 'signin' ? 'active' : ''}`}
                onClick={() => { setAuthMode('signin'); setAuthError('') }}>Sign in</button>
              <button className={`modal-tab ${authMode === 'signup' ? 'active' : ''}`}
                onClick={() => { setAuthMode('signup'); setAuthError('') }}>Sign up</button>
            </div>
            <div className="field">
              <label>EMAIL</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="field">
              <label>PASSWORD</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                onKeyDown={e => e.key === 'Enter' && handleAuth()} />
            </div>
            {authError && <div className="auth-error">{authError}</div>}
            <button className="modal-submit" onClick={handleAuth} disabled={authLoading}>
              {authLoading ? 'Loading…' : authMode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <div className="modal-divider">or continue without an account</div>
            <button className="modal-guest" onClick={() => setShowModal(false)}>
              Continue as guest — saves in this browser
            </button>
          </div>
        </div>
      )}
    </>
  )
}
