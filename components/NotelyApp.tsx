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
  saveStatus: 'saved' | 'saving'
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
        <span className={`save-status ${saveStatus}`}>{saveStatus === 'saved' ? '● saved' : '○ saving…'}</span>
      </div>

      {aiStatus && <div className="ai-status-bar">{aiStatus}</div>}
      {startedAt && <div className="note-timestamp">⏱ {fmtTime(startedAt)} · {fmtFull(startedAt)}</div>}

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

      {history.length > 1 && (
        <div className="time-travel-bar">
          <span className="tt-label">Time Travel</span>
          <input
            type="range"
            className="tt-scrubber"
            min={0}
            max={history.length - 1}
            value={travelIndex >= 0 ? travelIndex : history.length - 1}
            onChange={e => onTravel(parseInt(e.target.value))}
          />
          <span className="tt-time">
            {travelIndex >= 0 && history[travelIndex]
              ? fmtShortTime(history[travelIndex].timestamp)
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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
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

  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { startedAtRef.current = startedAt }, [startedAt])
  useEffect(() => { notesRef.current = notes }, [notes])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) { fetchCloud() }
    else {
      const gn = loadGuest()
      setNotes(gn)
      if (gn.length > 0) openNote(gn[0])
      else clearEditor()
    }
  }, [user])

  function clearEditor() {
    setActiveId(null); setTitle(''); setBody(''); setStartedAt(null)
    setWordCount(0); setAiStatus(''); setHistory([]); setTravelIndex(-1)
  }

  async function fetchCloud() {
    const res = await fetch('/api/notes')
    if (!res.ok) return
    const data: Note[] = await res.json()
    setNotes(data)
    if (data.length > 0) openNote(data[0])
    else clearEditor()
  }

  function openNote(note: Note) {
    setActiveId(note.id)
    setTitle(note.title)
    setBody(note.body)
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
    const now = new Date().toISOString()
    const tempId = `temp-${Date.now()}`
    const captureTimestamp = Date.now()
    const tempNote: Note = {
      id: tempId, title: '', body: '', created_at: now, updated_at: now,
      started_at: now, history: [{ content: '', timestamp: captureTimestamp,  }] , synced: false }
    const updated = [tempNote, ...notesRef.current]
    setNotes(updated)
    openNote(tempNote)
    if (!userRef.current) saveGuest(updated)
    setTimeout(() => titleRef.current?.focus(), 50)

    if (userRef.current) {
      try {
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '', body: '', started_at: now })
        })
        if (res.ok) {
          const cloud: Note = await res.json()
          setNotes(prev => prev.map(n => n.id === tempId ? { ...cloud, history: tempNote.history, synced: true } : n))
          setActiveId(cloud.id)
          activeIdRef.current = cloud.id
        }
      } catch {}
    }
  }

  const doSave = useCallback(async (t: string, b: string, sa: string | null) => {
    const id = activeIdRef.current
    if (!id || id.startsWith('temp-')) return
    const now = new Date().toISOString()
    if (userRef.current) {
      await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, body: b, started_at: sa })
      })
    }
    setNotes(prev => {
      const updated = prev.map(n =>
        n.id === id ? { ...n, title: t, body: b, started_at: sa ?? undefined, updated_at: now } : n
      )
      if (!userRef.current) saveGuest(updated)
      return updated
    })
    setSaveStatus('saved')
  }, [])

  function scheduleSave(t: string, b: string, sa: string | null) {
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(t, b, sa), 800)
  }

  function addToHistory(b: string, source: NoteVersion['source'] = 'edit') {
    if (historyTimer.current) clearTimeout(historyTimer.current)
    historyTimer.current = setTimeout(() => {
      setHistory(prev => {
        const last = prev[prev.length - 1]
        if (last?.content === b) return prev
        return [...prev, { content: b, timestamp: Date.now(), source }]
      })
    }, 2000)
  }

  function onTitleChange(v: string) {
    let sa = startedAtRef.current
    if (!sa) { sa = new Date().toISOString(); setStartedAt(sa) }
    setTitle(v)
    scheduleSave(v, body, sa)
  }

  function onBodyChange(v: string) {
    let sa = startedAtRef.current
    if (!sa) { sa = new Date().toISOString(); setStartedAt(sa) }
    setBody(v)
    setWordCount(v.trim() ? v.trim().split(/\s+/).length : 0)
    scheduleSave(title, v, sa)
    addToHistory(v)
    setTravelIndex(-1)
  }

  function onTravel(idx: number) { setTravelIndex(idx) }

  function onRestoreVersion() {
    if (travelIndex < 0 || !history[travelIndex]) return
    const restored = history[travelIndex].content
    setBody(restored)
    setTravelIndex(-1)
    scheduleSave(title, restored, startedAt)
    addToHistory(restored, 'restore')
  }

  const onTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus() }
  }, [])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (userRef.current && !id.startsWith('temp-')) {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    }
    const updated = notesRef.current.filter(n => n.id !== id)
    if (!userRef.current) saveGuest(updated)
    setNotes(updated)
    if (activeIdRef.current === id) {
      if (updated.length > 0) openNote(updated[0])
      else { clearEditor(); setMobileView('list') }
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
              if (saveTimer.current) { clearTimeout(saveTimer.current); doSave(title, body, startedAt) }
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
