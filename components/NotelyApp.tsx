'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { User } from '@supabase/supabase-js'

interface Note {
  id: string
  user_id?: string
  title: string
  body: string
  created_at: string
  updated_at: string
  started_at?: string
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtFullDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  })
}

const GUEST_KEY = 'notely_notes'
function loadGuest(): Note[] {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]') } catch { return [] }
}
function saveGuest(n: Note[]) { localStorage.setItem(GUEST_KEY, JSON.stringify(n)) }

export default function NotelyApp() {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [titleVal, setTitleVal] = useState('')
  const [bodyVal, setBodyVal] = useState('')
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [hasTyped, setHasTyped] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [showModal, setShowModal] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)

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
      else { setActiveId(null); setTitleVal(''); setBodyVal(''); setStartedAt(null); setHasTyped(false) }
    }
  }, [user])

  async function fetchCloud() {
    const res = await fetch('/api/notes')
    if (!res.ok) return
    const data: Note[] = await res.json()
    setNotes(data)
    if (data.length > 0) openNote(data[0])
    else { setActiveId(null); setTitleVal(''); setBodyVal(''); setStartedAt(null); setHasTyped(false) }
  }

  function openNote(note: Note) {
    setActiveId(note.id)
    setTitleVal(note.title)
    setBodyVal(note.body)
    setStartedAt(note.started_at || null)
    setHasTyped(false)
    setSaveStatus('saved')
    setSidebarOpen(false)
    setMobileView('editor')
  }

  async function newNote() {
    const now = new Date().toISOString()
    if (user) {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '', body: '', started_at: now })
      })
      if (!res.ok) return
      const note: Note = await res.json()
      setNotes(prev => [note, ...prev])
      openNote(note)
      setTimeout(() => titleRef.current?.focus(), 50)
    } else {
      const note: Note = {
        id: Date.now().toString(), title: '', body: '',
        created_at: now, updated_at: now, started_at: now
      }
      const updated = [note, ...notes]
      setNotes(updated)
      saveGuest(updated)
      openNote(note)
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }

  const scheduleSave = useCallback((title: string, body: string, sa: string | null) => {
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!activeId) return
      const now = new Date().toISOString()
      if (user) {
        await fetch(`/api/notes/${activeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body, started_at: sa })
        })
        setNotes(prev => prev.map(n =>
          n.id === activeId ? { ...n, title, body, started_at: sa ?? undefined, updated_at: now } : n
        ))
      } else {
        const updated = notes.map(n =>
          n.id === activeId ? { ...n, title, body, started_at: sa ?? undefined, updated_at: now } : n
        )
        setNotes(updated)
        saveGuest(updated)
      }
      setSaveStatus('saved')
    }, 700)
  }, [activeId, user, notes])

  function onFirstKeyPress() {
    if (!hasTyped && !startedAt) {
      const now = new Date().toISOString()
      setStartedAt(now)
      setHasTyped(true)
      return now
    }
    setHasTyped(true)
    return startedAt
  }

  function onTitleChange(v: string) {
    const sa = onFirstKeyPress()
    setTitleVal(v)
    scheduleSave(v, bodyVal, sa ?? startedAt)
  }

  function onBodyChange(v: string) {
    const sa = onFirstKeyPress()
    setBodyVal(v)
    scheduleSave(titleVal, v, sa ?? startedAt)
  }

  async function deleteNote(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (user) await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    const updated = notes.filter(n => n.id !== id)
    if (!user) saveGuest(updated)
    setNotes(updated)
    if (activeId === id) {
      if (updated.length > 0) openNote(updated[0])
      else { setActiveId(null); setTitleVal(''); setBodyVal(''); setStartedAt(null); setHasTyped(false); setMobileView('list') }
    }
  }

  async function handleAuth() {
    setAuthError('')
    setAuthLoading(true)
    let error
    if (authMode === 'signup') {
      ;({ error } = await supabase.auth.signUp({ email, password }))
    } else {
      ;({ error } = await supabase.auth.signInWithPassword({ email, password }))
    }
    setAuthLoading(false)
    if (error) { setAuthError(error.message); return }
    setShowModal(false)
    setEmail('')
    setPassword('')
  }

  async function signOut() {
    await supabase.auth.signOut()
    const gn = loadGuest()
    setNotes(gn)
    setActiveId(null); setTitleVal(''); setBodyVal(''); setStartedAt(null); setHasTyped(false); setMobileView('list')
  }

  const wordCount = bodyVal.trim() ? bodyVal.trim().split(/\s+/).length : 0
  const activeNote = notes.find(n => n.id === activeId)

  const TimestampBadge = () => {
    const ts = startedAt || activeNote?.started_at
    if (!ts) return null
    return (
      <div className="note-timestamp">
        ⏱ Started at {fmtTime(ts)} &nbsp;·&nbsp; {fmtFullDateTime(ts)}
      </div>
    )
  }

  const NotesList = ({ className }: { className?: string }) => (
    <div className={className}>
      {notes.length === 0
        ? <div className="empty-list">No notes yet.<br />Hit + to begin.</div>
        : notes.map(n => (
          <div key={n.id} className={`note-item ${n.id === activeId ? 'active' : ''}`} onClick={() => openNote(n)}>
            <div className="note-item-title">{n.title || 'Untitled'}</div>
            <div className="note-item-preview">{n.body.slice(0, 60) || '—'}</div>
            <div className="note-item-date">
              {n.started_at && <span style={{ marginRight: 6 }}>⏱ {fmtTime(n.started_at)}</span>}
              {fmtDate(n.updated_at)}
            </div>
            <button className="note-del" onClick={e => deleteNote(n.id, e)} title="Delete">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))
      }
    </div>
  )

  const EditorContent = () => (
    activeNote ? (
      <div className="editor-wrap">
        <div className="toolbar">
          <button className="tool-btn" title="Delete note" onClick={e => deleteNote(activeId!, e)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3.5h9M5 3.5V2.5h3v1M5.5 6v4M7.5 6v4M3 3.5l.7 7h5.6l.7-7"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="word-count">{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
          <span className={`save-status ${saveStatus}`}>{saveStatus === 'saved' ? '● saved' : '○ saving…'}</span>
        </div>
        <TimestampBadge />
        <textarea ref={titleRef} className="note-title" placeholder="Untitled" value={titleVal}
          onChange={e => onTitleChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus() } }}
          rows={1}
        />
        <textarea ref={bodyRef} className="note-body" placeholder="Start writing…" value={bodyVal}
          onChange={e => onBodyChange(e.target.value)}
        />
      </div>
    ) : (
      <div className="empty-editor">
        <svg width="48" height="48" viewBox="0 0 52 52" fill="none">
          <rect x="10" y="8" width="32" height="36" rx="3" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M17 18h18M17 24h18M17 30h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <p>Select a note or create one</p>
      </div>
    )
  )

  return (
    <>
      {/* ── MOBILE HEADER ── */}
      <div className="mobile-header">
        {mobileView === 'list' ? (
          <>
            <div className="mobile-header-brand">Notely<span>.</span></div>
            <div style={{ display: 'flex', gap: 2 }}>
              <button className="mobile-btn" onClick={() => setShowModal(true)} title="Account">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M3 17c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
              <button className="mobile-btn" onClick={newNote} title="New note">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="mobile-back-btn" onClick={() => setMobileView('list')}>
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
                <button className="mobile-btn" onClick={e => { deleteNote(activeId, e); setMobileView('list') }}>
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
        {/* Backdrop */}
        <div className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />

        {/* ── SIDEBAR ── */}
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
          <div className="notes-count">
            {notes.length > 0 ? `${notes.length} note${notes.length !== 1 ? 's' : ''}` : ''}
          </div>
          <NotesList className="notes-list" />
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

        {/* ── EDITOR AREA ── */}
        <main className="editor-area">
          {/* Mobile list view */}
          {mobileView === 'list' && (
            <NotesList className="mobile-notes-panel" />
          )}
          {/* Mobile editor view */}
          {mobileView === 'editor' && (
            <div className="mobile-editor">
              <EditorContent />
            </div>
          )}
          {/* Desktop editor — always visible */}
          <div className="desktop-editor">
            <EditorContent />
          </div>
        </main>
      </div>

      {/* ── AUTH MODAL ── */}
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
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="field">
              <label>PASSWORD</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
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
