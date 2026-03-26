'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { User } from '@supabase/supabase-js'

/* ── 1. TYPE DEFINITIONS ── */

interface Note {
  id: string
  user_id?: string
  title: string
  body: string
  created_at: string
  updated_at: string
  started_at?: string
  synced?: boolean
}

interface PreviewData {
  title: string
  domain: string
  url: string
  image?: string
  description?: string
  fullContent?: string
}

interface EditorProps {
  activeId: string | null
  title: string
  body: string
  startedAt: string | null
  saveStatus: 'saved' | 'saving'
  wordCount: number
  aiStatus: string
  onTitleChange: (v: string) => void
  onBodyChange: (v: string) => void
  onTitleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onDelete: (id: string, e: React.MouseEvent) => void
  onSummarize: () => void
  onExport: () => void
  bodyRef: React.RefObject<HTMLTextAreaElement | null>
  titleRef: React.RefObject<HTMLTextAreaElement | null>
  linkPreviews: PreviewData[]
  isLinkLoading: boolean
  onExtract: (lp: PreviewData) => void
  onDigest: (lp: PreviewData) => void
  aiSummary: string
  onClearSummary: () => void
  history: string[]
  historyIndex: number
  onHistoryChange: (idx: number) => void
}

/* ── 2. UTILITY FUNCTIONS ── */

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

function fmtFull(iso: string) {
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

/* ── 3. COMPONENTS ── */

function NotesList({ notes, activeId, onOpen, onDelete, className }: { notes: Note[], activeId: string | null, onOpen: (n: Note) => void, onDelete: (id: string, e: React.MouseEvent) => void, className?: string }) {
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

function Editor({
  activeId, title, body, startedAt, saveStatus, wordCount, aiStatus,
  onTitleChange, onBodyChange, onTitleKeyDown, onDelete,
  onSummarize, onExport, bodyRef, titleRef, linkPreviews, isLinkLoading, onExtract,
  onDigest, aiSummary, onClearSummary, history, historyIndex, onHistoryChange
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

  return (
    <div className="editor-outer-wrap" style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
      <div className="editor-main-column" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', position: 'relative' }}>
        <div className="toolbar">
          <button className="tool-btn" onClick={e => onDelete(activeId, e)}><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2.5h3v1M5.5 6v4M7.5 6v4M3 3.5l.7 7h5.6l.7-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          <div className="tool-sep" />
          <button className="tool-btn ai-btn" onClick={onSummarize} disabled={!body.trim() || !!aiSummary}><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5l1 2.5h2.5l-2 1.5.8 2.5-2.3-1.5-2.3 1.5.8-2.5-2-1.5H5.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>Summarize</button>
          <button className="tool-btn ai-btn" onClick={onExport}><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8 1.5H4a1 1 0 00-1 1v8a1 1 0 001 1h5a1 1 0 001-1V4.5L8 1.5z" stroke="currentColor" strokeWidth="1.1"/></svg>Export</button>
          <span className="word-count">{wordCount}w</span>
          <span className={`save-status ${saveStatus}`}>{saveStatus === 'saved' ? '● saved' : '○ saving…'}</span>
        </div>

        {aiStatus && <div className="ai-status-bar">{aiStatus}</div>}
        {startedAt && <div className="note-timestamp">⏱ {fmtTime(startedAt)} · {fmtFull(startedAt)}</div>}
        
        <textarea ref={titleRef} className="note-title" placeholder="Untitled" value={title} onChange={e => onTitleChange(e.target.value)} onKeyDown={onTitleKeyDown} rows={1} />
        <textarea ref={bodyRef} className="note-body" placeholder="Start writing…" value={body} onChange={e => onBodyChange(e.target.value)} />

        <div className="link-previews-container" style={{ padding: '0 24px 32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isLinkLoading && <div style={{ fontSize: '11px', color: '#a0a0a0' }}>Scanning links...</div>}
          {linkPreviews.map((lp, idx) => (
            <div key={lp.url + idx} className="link-card" style={{ display: 'flex', border: '1px solid #eee', borderRadius: '4px', backgroundColor: '#fafaf9', overflow: 'hidden' }}>
              <div style={{ flex: 1, padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>{lp.title}</div>
                <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', marginBottom: '12px' }}>{lp.domain}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => onExtract(lp)} style={{ fontSize: '10px', padding: '6px 12px', background: '#1a1a1a', color: '#fff', border: 'none' }}>Clip Page</button>
                  <button onClick={() => onDigest(lp)} style={{ fontSize: '10px', padding: '6px 12px', background: 'transparent', color: '#b5541c', border: '1px solid #b5541c' }}>Digest</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {history.length > 1 && (
          <div className="time-travel-bar">
            <span className="history-label">History</span>
            <input type="range" min="0" max={history.length - 1} value={historyIndex} onChange={(e) => onHistoryChange(parseInt(e.target.value))} className="history-scrubber" />
          </div>
        )}
      </div>

      {aiSummary && (
        <aside className="summary-sidebar">
          <div className="summary-header">
            <span className="summary-label">Ai summary</span>
            <button className="summary-close" onClick={onClearSummary}>✕</button>
          </div>
          <div className="summary-content">{aiSummary}</div>
        </aside>
      )}
    </div>
  )
}

export default function NotelyApp() {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const [wordCount, setWordCount] = useState(0)
  const [aiStatus, setAiStatus] = useState('')
  const [aiSummary, setAiSummary] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list')
  const [linkPreviews, setLinkPreviews] = useState<PreviewData[]>([])
  const [isLinkLoading, setIsLinkLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(0)

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const userRef = useRef<User | null>(null)
  const startedAtRef = useRef<string | null>(null)
  const notesRef = useRef<Note[]>([])

  useEffect(() => { activeIdRef.current = activeId; userRef.current = user; startedAtRef.current = startedAt; notesRef.current = notes; }, [activeId, user, startedAt, notes])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => { setUser(session?.user ?? null) })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) { fetchCloud() }
    else {
      const gn = loadGuest(); setNotes(gn);
      if (gn.length > 0) openNote(gn[0]); else clearEditor();
    }
  }, [user])

  // FEATURE 1: Deep Link Listener
  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection()?.toString();
      if (selection && selection.length > 5) {
        const matches = notes.filter(n => n.id !== activeId && (n.body.toLowerCase().includes(selection.toLowerCase()) || n.title.toLowerCase().includes(selection.toLowerCase()))).slice(0, 3);
        if (matches.length > 0) {
          setAiSummary(`Potential Connections:\n\n` + matches.map(m => `• ${m.title || 'Untitled'}\n  "${m.body.slice(0, 100)}..."`).join('\n\n'));
        }
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [notes, activeId]);

  // FEATURE 3: History Sync
  useEffect(() => {
    if (saveStatus === 'saved' && body && history[history.length - 1] !== body) {
      setHistory(prev => [...prev.slice(-19), body]);
      setHistoryIndex(prev => Math.min(prev + 1, 19));
    }
  }, [saveStatus]);

  function clearEditor() { setActiveId(null); setTitle(''); setBody(''); setStartedAt(null); setWordCount(0); setAiStatus(''); setAiSummary(''); setLinkPreviews([]); setHistory([]); }

  async function fetchCloud() {
    const res = await fetch('/api/notes')
    if (!res.ok) return
    const data: Note[] = await res.json()
    setNotes(data); if (data.length > 0) openNote(data[0]); else clearEditor()
  }

  function openNote(note: Note) {
    setActiveId(note.id); setTitle(note.title); setBody(note.body); setStartedAt(note.started_at || null);
    setWordCount(note.body.trim() ? note.body.trim().split(/\s+/).length : 0);
    setSaveStatus('saved'); setAiStatus(''); setAiSummary(''); setSidebarOpen(false); setMobileView('editor'); setLinkPreviews([]); setHistory([note.body]); setHistoryIndex(0);
  }

  async function newNote() {
    const now = new Date().toISOString()
    const tempId = `temp-${Date.now()}`
    const tempNote: Note = { id: tempId, title: '', body: '', created_at: now, updated_at: now, started_at: now, synced: false }
    const updatedNotes = [tempNote, ...notesRef.current]
    setNotes(updatedNotes); openNote(tempNote);
    if (!userRef.current) saveGuest(updatedNotes)
    setTimeout(() => titleRef.current?.focus(), 50)
    if (userRef.current) {
      try {
        const res = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '', body: '', started_at: now }) })
        if (res.ok) {
          const cloudNote: Note = await res.json()
          setNotes(prev => prev.map(n => n.id === tempId ? { ...cloudNote, synced: true } : n))
          setActiveId(cloudNote.id); activeIdRef.current = cloudNote.id
        }
      } catch (e) {}
    }
  }

  const doSave = useCallback(async (t: string, b: string, sa: string | null) => {
    const id = activeIdRef.current; if (!id) return;
    const now = new Date().toISOString()
    if (userRef.current && !id.startsWith('temp-')) {
      await fetch(`/api/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t, body: b, started_at: sa }) })
    }
    setNotes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, title: t, body: b, started_at: sa ?? undefined, updated_at: now } : n)
      if (!userRef.current) saveGuest(updated); return updated
    })
    setSaveStatus('saved')
  }, [])

  function scheduleSave(t: string, b: string, sa: string | null) {
    setSaveStatus('saving'); if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(t, b, sa), 800)
  }

  function onTitleChange(v: string) {
    let sa = startedAtRef.current; if (!sa) { sa = new Date().toISOString(); setStartedAt(sa) }
    setTitle(v); scheduleSave(v, body, sa)
  }

  function onBodyChange(v: string) {
    let sa = startedAtRef.current; if (!sa) { sa = new Date().toISOString(); setStartedAt(sa) }
    setBody(v); setWordCount(v.trim() ? v.trim().split(/\s+/).length : 0)
    scheduleSave(title, v, sa)
    const matches: string[] = v.match(/(https?:\/\/[^\s]+)/g) || []
    setLinkPreviews(prev => prev.filter(lp => matches.includes(lp.url)))
    matches.forEach(url => { if (!linkPreviews.find(lp => lp.url === url)) fetchPreview(url) })
  }

  async function fetchPreview(url: string) {
    setIsLinkLoading(true)
    try {
      const res = await fetch('/api/link-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      const data = await res.json()
      if (data.title) setLinkPreviews(prev => prev.find(p => p.url === url) ? prev : [...prev, { ...data, url }])
    } catch (e) {} finally { setIsLinkLoading(false) }
  }

  async function handleExtract(lp: PreviewData) {
    setAiStatus('✦ Extracting...');
    try {
      const res = await fetch('/api/link-preview', { method: 'POST', body: JSON.stringify({ url: lp.url }) });
      const data = await res.json();
      const divider = `\n\n─── ${data.domain.toUpperCase()} CLIP ───\n`;
      const newBody = body + divider + (data.fullContent || '');
      setBody(newBody); scheduleSave(title, newBody, startedAt);
      setAiStatus('');
    } catch { setAiStatus('✦ Failed'); }
  }

  async function handleDigest(lp: PreviewData) {
    setAiStatus('✦ Digesting...');
    try {
      const res = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: lp.title, body: lp.fullContent }) });
      const data = await res.json();
      const divider = `\n\n─── ${lp.domain.toUpperCase()} DIGEST ───\n`;
      const newBody = body + divider + data.summary + '\n';
      setBody(newBody); scheduleSave(title, newBody, startedAt);
      setAiStatus('');
    } catch { setAiStatus('✦ Failed'); }
  }

  async function handleSummarize() {
    if (!body.trim()) return; setAiStatus('✦ Thinking…')
    try {
      const response = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body }) })
      const data = await response.json()
      setAiSummary(data.summary); setAiStatus('');
    } catch { setAiStatus('✦ Error'); }
  }

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); if (userRef.current && !id.startsWith('temp-')) { await fetch(`/api/notes/${id}`, { method: 'DELETE' }) }
    const updated = notesRef.current.filter(n => n.id !== id); if (!userRef.current) saveGuest(updated); setNotes(updated)
    if (activeIdRef.current === id) { if (updated.length > 0) openNote(updated[0]); else { clearEditor(); setMobileView('list') } }
  }, [])

  async function handleAuth() {
    setAuthError(''); setAuthLoading(true); let error;
    if (authMode === 'signup') { ;({ error } = await supabase.auth.signUp({ email, password })) }
    else { ;({ error } = await supabase.auth.signInWithPassword({ email, password })) }
    setAuthLoading(false); if (error) { setAuthError(error.message); return }
    setShowModal(false); setEmail(''); setPassword('')
  }

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')

  return (
    <>
      <div className="mobile-header">
        {mobileView === 'list' ? (
          <><div className="mobile-header-brand">Notely<span>.</span></div><div style={{ display: 'flex', gap: 2 }}><button className="mobile-btn" onClick={() => setShowModal(true)}><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3 17c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></button><button className="mobile-btn" onClick={newNote}><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></button></div></>
        ) : (
          <><button className="mobile-back-btn" onClick={() => { if (saveTimer.current) { clearTimeout(saveTimer.current); doSave(title, body, startedAt) } setMobileView('list') }}><svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M11 3.5L6 8.5l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>Notes</button><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className={`save-status ${saveStatus}`} style={{ fontSize: 10 }}>{saveStatus === 'saved' ? '● saved' : '○ saving…'}</span>{activeId && <button className="mobile-btn" onClick={e => { handleDelete(activeId, e); setMobileView('list') }}><svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M3 5h11M6.5 5V4h4v1M7 8v5M10 8v5M3.5 5l1 9h7l1-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></button>}</div></>
        )}
      </div>

      <div className="app">
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="brand">Notely<span className="brand-dot">.</span></div>
            <div className="brand-sub">just write — nothing else</div>
            <button className="new-btn" onClick={newNote}><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>New note</button>
          </div>
          <NotesList notes={notes} activeId={activeId} onOpen={openNote} onDelete={handleDelete} className="notes-list" />
          <div className="sidebar-footer">
            <div className="user-badge">{user ? <span className="user-email">{user.email?.split('@')[0]}</span> : 'guest mode'}</div>
            {user ? <button className="auth-btn" onClick={() => supabase.auth.signOut()}>sign out</button> : <button className="auth-btn" onClick={() => setShowModal(true)}>sign in</button>}
          </div>
        </aside>

        <main className="editor-area">
          {mobileView === 'list' ? (
            <NotesList notes={notes} activeId={activeId} onOpen={openNote} onDelete={handleDelete} className="mobile-notes-panel" />
          ) : (
            <Editor
              activeId={activeId} title={title} body={body} startedAt={startedAt} saveStatus={saveStatus} wordCount={wordCount} aiStatus={aiStatus}
              onTitleChange={onTitleChange} onBodyChange={onBodyChange} onTitleKeyDown={e => e.key === 'Enter' && (e.preventDefault(), bodyRef.current?.focus())} 
              onDelete={handleDelete} onSummarize={handleSummarize} onExport={() => exportTxt(title, body, startedAt)} 
              bodyRef={bodyRef} titleRef={titleRef} linkPreviews={linkPreviews} isLinkLoading={isLinkLoading} 
              onExtract={handleExtract} onDigest={handleDigest}
              aiSummary={aiSummary} onClearSummary={() => setAiSummary('')}
              history={history} historyIndex={historyIndex} onHistoryChange={(idx) => { setHistoryIndex(idx); setBody(history[idx]); }}
            />
          )}
        </main>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Welcome back.</div>
            <div className="modal-tabs">
              <button className={`modal-tab ${authMode === 'signin' ? 'active' : ''}`} onClick={() => setAuthMode('signin')}>Sign in</button>
              <button className={`modal-tab ${authMode === 'signup' ? 'active' : ''}`} onClick={() => setAuthMode('signup')}>Sign up</button>
            </div>
            <div className="field"><label>EMAIL</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div className="field"><label>PASSWORD</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} /></div>
            {authError && <div className="auth-error">{authError}</div>}
            <button className="modal-submit" onClick={handleAuth} disabled={authLoading}>{authLoading ? 'Loading…' : 'Go'}</button>
          </div>
        </div>
      )}
    </>
  )
}
