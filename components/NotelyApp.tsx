'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { User } from '@supabase/supabase-js'

interface Note {
  id: string; user_id?: string; title: string; body: string; created_at: string; updated_at: string; started_at?: string; synced?: boolean;
}

// --- Formatters ---
function fmtDate(iso: string) {
  const d = new Date(iso); const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }); }
function fmtFull(iso: string) { return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }

const GUEST_KEY = 'notely_notes';
function loadGuest(): Note[] { try { return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]') } catch { return [] } }
function saveGuest(n: Note[]) { localStorage.setItem(GUEST_KEY, JSON.stringify(n)) }

function exportTxt(title: string, body: string, startedAt: string | null) {
  const ts = startedAt ? `Started: ${fmtFull(startedAt)}\n\n` : '';
  const content = `${title || 'Untitled'}\n${'─'.repeat(40)}\n${ts}${body}`;
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${(title || 'note').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`; a.click(); URL.revokeObjectURL(url);
}

// --- Sub-Components ---
function NotesList({ notes, activeId, onOpen, onDelete, className }: any) {
  return (
    <div className={className}>
      {notes.length === 0 ? <div className="empty-list">No notes yet.<br />Hit + to begin.</div> : notes.map((n: any) => (
          <div key={n.id} className={`note-item ${n.id === activeId ? 'active' : ''}`} onClick={() => onOpen(n)}>
            <div className="note-item-title">{n.title || 'Untitled'}</div>
            <div className="note-item-preview">{n.body.slice(0, 60) || '—'}</div>
            <div className="note-item-date">{n.started_at && <span style={{ marginRight: 6 }}>⏱ {fmtTime(n.started_at)}</span>} {fmtDate(n.updated_at)}</div>
            <button className="note-del" onClick={e => onDelete(n.id, e)} title="Delete">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </button>
          </div>
      ))}
    </div>
  )
}

function Editor({ activeId, title, body, startedAt, saveStatus, wordCount, aiStatus, onTitleChange, onBodyChange, onTitleKeyDown, onDelete, onSummarize, onExport, bodyRef, titleRef, linkPreview, isLinkLoading, onExtract }: any) {
  if (!activeId) return <div className="empty-editor"><p>Select a note or create one</p></div>

  return (
    <div className="editor-wrap">
      <div className="toolbar">
        <button className="tool-btn" onClick={e => onDelete(activeId, e)}><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2.5h3v1M5.5 6v4M7.5 6v4M3 3.5l.7 7h5.6l.7-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
        <div className="tool-sep" />
        <button className="tool-btn ai-btn" onClick={onSummarize} disabled={!body.trim()}>Summarize</button>
        <button className="tool-btn ai-btn" onClick={onExport}>Export</button>
        <span className="word-count">{wordCount}w</span>
        <span className={`save-status ${saveStatus}`}>{saveStatus === 'saved' ? '● saved' : '○ saving…'}</span>
      </div>
      {aiStatus && <div className="ai-status-bar">{aiStatus}</div>}
      {startedAt && <div className="note-timestamp">⏱ {fmtTime(startedAt)} · {fmtFull(startedAt)}</div>}
      <textarea ref={titleRef} className="note-title" placeholder="Untitled" value={title} onChange={e => onTitleChange(e.target.value)} onKeyDown={onTitleKeyDown} rows={1} />
      <textarea ref={bodyRef} className="note-body" placeholder="Start writing…" value={body} onChange={e => onBodyChange(e.target.value)} />

      {/* COMPACT LINK PREVIEW CARD */}
      <div style={{ padding: '0 20px 20px' }}>
        {isLinkLoading && <div style={{ fontSize: '12px', color: '#888' }}>Checking link...</div>}
        {linkPreview && (
          <div style={{ display: 'flex', maxWidth: '500px', border: '1px solid #e5dfd0', borderRadius: '8px', backgroundColor: '#fff', overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: '12px', minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#000' }}>{linkPreview.title}</div>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>{linkPreview.domain}</div>
              <button onClick={onExtract} style={{ fontSize: '11px', padding: '5px 10px', backgroundColor: '#e5dfd0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: '#4a4439' }}>Clip Page Text</button>
            </div>
            {linkPreview.image && <div style={{ width: '100px', minWidth: '100px' }}><img src={linkPreview.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /></div>}
          </div>
        )}
      </div>
    </div>
  )
}

export default function NotelyApp() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [wordCount, setWordCount] = useState(0);
  const [aiStatus, setAiStatus] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
  
  const [linkPreview, setLinkPreview] = useState<any | null>(null);
  const [isLinkLoading, setIsLinkLoading] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<any>(null);
  const activeIdRef = useRef<string | null>(null);
  const userRef = useRef<User | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const notesRef = useRef<Note[]>([]);

  useEffect(() => { activeIdRef.current = activeId; userRef.current = user; startedAtRef.current = startedAt; notesRef.current = notes; }, [activeId, user, startedAt, notes])
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, [supabase.auth])

  useEffect(() => {
    if (user) {
      fetch('/api/notes').then(res => res.json()).then(data => {
        setNotes(data); if (data.length > 0) openNote(data[0]);
      });
    } else {
      const gn = loadGuest(); setNotes(gn); if (gn.length > 0) openNote(gn[0]);
    }
  }, [user])

  function clearEditor() { setActiveId(null); setTitle(''); setBody(''); setStartedAt(null); setWordCount(0); setAiStatus(''); setLinkPreview(null); }

  function openNote(n: Note) {
    setActiveId(n.id); setTitle(n.title); setBody(n.body);
    setStartedAt(n.started_at || null);
    setWordCount(n.body.trim() ? n.body.trim().split(/\s+/).length : 0);
    setSaveStatus('saved'); setMobileView('editor'); setLinkPreview(null);
  }

  const doSave = useCallback(async (t: string, b: string) => {
    const id = activeIdRef.current; if (!id) return;
    if (userRef.current && !id.startsWith('temp-')) {
      await fetch(`/api/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t, body: b }) });
    }
    setNotes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, title: t, body: b, updated_at: new Date().toISOString() } : n);
      if (!userRef.current) saveGuest(updated); return updated;
    });
    setSaveStatus('saved');
  }, []);

  function scheduleSave(t: string, b: string) {
    setSaveStatus('saving'); if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(t, b), 800);
  }

  function onTitleChange(v: string) {
    let sa = startedAtRef.current; if (!sa) { sa = new Date().toISOString(); setStartedAt(sa) }
    setTitle(v); scheduleSave(v, body);
  }

  function onBodyChange(v: string) {
    let sa = startedAtRef.current; if (!sa) { sa = new Date().toISOString(); setStartedAt(sa) }
    setBody(v); setWordCount(v.trim() ? v.trim().split(/\s+/).length : 0);
    scheduleSave(title, v);

    // CRITICAL FIX: Detection logic simplified and re-triggered correctly
    const match = v.match(/(https?:\/\/[^\s]+)/);
    if (match) { 
        const url = match[0];
        if (!linkPreview || linkPreview.url !== url) {
            setIsLinkLoading(true);
            fetch('/api/link-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
              .then(res => res.json())
              .then(data => { if (data.title) setLinkPreview(data); setIsLinkLoading(false); })
              .catch(() => setIsLinkLoading(false));
        }
    } else { 
        setLinkPreview(null); 
    }
  }

  async function handleExtract() {
    if (!linkPreview?.url) return;
    setAiStatus('✦ Extracting...');
    try {
      const res = await fetch('/api/link-preview', { method: 'POST', body: JSON.stringify({ url: linkPreview.url }) });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Protected site."); setAiStatus(''); return; }
      const newBody = body + `\n\n--- Content from ${data.domain} ---\n` + data.fullContent;
      setBody(newBody); scheduleSave(title, newBody); setLinkPreview(null); setAiStatus('');
    } catch { setAiStatus(''); }
  }

  async function handleSummarize() {
    if (!body.trim()) return; setAiStatus('✦ Summarizing…');
    try {
      const res = await fetch('/api/summarize', { method: 'POST', body: JSON.stringify({ title, body }) });
      const data = await res.json();
      const newBody = body + '\n\n─── AI Summary ───\n' + data.summary;
      setBody(newBody); scheduleSave(title, newBody); setAiStatus('');
    } catch { setAiStatus(''); }
  }

  async function newNote() {
    const now = new Date().toISOString(); const tempId = `temp-${Date.now()}`;
    const tempNote = { id: tempId, title: '', body: '', created_at: now, updated_at: now, synced: false };
    const updatedNotes = [tempNote, ...notesRef.current]; setNotes(updatedNotes); openNote(tempNote);
    if (!user) saveGuest(updatedNotes);
  }

  const handleDelete = async (id: string, e: any) => {
    e.stopPropagation();
    if (user && !id.startsWith('temp-')) await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    const updated = notes.filter(n => n.id !== id); setNotes(updated);
    if (updated.length > 0) openNote(updated[0]); else setMobileView('list');
  };

  const signOut = async () => { await supabase.auth.signOut(); setNotes(loadGuest()); setMobileView('list'); };

  const handleAuth = async () => {
    setAuthError(''); setAuthLoading(true);
    let error;
    if (authMode === 'signin') ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    else ({ error } = await supabase.auth.signUp({ email, password }));
    setAuthLoading(false);
    if (error) setAuthError(error.message); else setShowModal(false);
  }

  return (
    <>
      <div className="mobile-header">
        {mobileView === 'list' ? (
          <div className="mobile-header-brand">Notely. <button onClick={newNote} className="mobile-btn">+</button></div>
        ) : (
          <button onClick={() => setMobileView('list')} className="mobile-back-btn">← Back</button>
        )}
      </div>
      <div className="app">
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header"><div className="brand">Notely.</div><button className="new-btn" onClick={newNote}>New note</button></div>
          <NotesList notes={notes} activeId={activeId} onOpen={openNote} onDelete={handleDelete} className="notes-list" />
          <div className="sidebar-footer">
            {user ? <button className="auth-btn" onClick={signOut}>sign out</button> : <button className="auth-btn" onClick={() => setShowModal(true)}>sign in</button>}
          </div>
        </aside>
        <main className="editor-area">
          {mobileView === 'list' ? <NotesList notes={notes} activeId={activeId} onOpen={openNote} onDelete={handleDelete} className="mobile-notes-panel" /> : (
            <Editor activeId={activeId} title={title} body={body} startedAt={startedAt} saveStatus={saveStatus} wordCount={wordCount} aiStatus={aiStatus} onTitleChange={setTitle} onBodyChange={onBodyChange} onTitleKeyDown={() => {}} onDelete={handleDelete} onSummarize={handleSummarize} onExport={() => exportTxt(title, body, startedAt)} bodyRef={bodyRef} titleRef={titleRef} linkPreview={linkPreview} isLinkLoading={isLinkLoading} onExtract={handleExtract} />
          )}
        </main>
      </div>
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-tabs">
                <button onClick={() => setAuthMode('signin')}>Sign in</button>
                <button onClick={() => setAuthMode('signup')}>Sign up</button>
            </div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
            {authError && <div className="auth-error">{authError}</div>}
            <button className="modal-submit" onClick={handleAuth}>{authLoading ? 'Loading...' : 'Go'}</button>
          </div>
        </div>
      )}
    </>
  )
}
