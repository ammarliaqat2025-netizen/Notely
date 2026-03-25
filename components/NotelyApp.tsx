'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { User } from '@supabase/supabase-js'

interface Note {
  id: string; title: string; body: string; created_at: string; updated_at: string; started_at?: string;
}

// --- Helpers ---
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }); }
function fmtFull(iso: string) { return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }
const loadGuest = () => JSON.parse(localStorage.getItem('notely_notes') || '[]');
const saveGuest = (n: any) => localStorage.setItem('notely_notes', JSON.stringify(n));

// --- Editor Component ---
function Editor({ activeId, title, body, startedAt, saveStatus, wordCount, aiStatus, onTitleChange, onBodyChange, onTitleKeyDown, onDelete, onSummarize, onExport, bodyRef, titleRef, linkPreview, isLinkLoading, onExtract }: any) {
  if (!activeId) return <div className="empty-editor">Select a note or create one</div>

  return (
    <div className="editor-wrap">
      <div className="toolbar">
        <button className="tool-btn" onClick={e => onDelete(activeId, e)}>Delete</button>
        <button className="tool-btn ai-btn" onClick={onSummarize}>Summarize</button>
        <button className="tool-btn ai-btn" onClick={onExport}>Export</button>
        <span className="word-count">{wordCount}w</span>
        <span className={`save-status ${saveStatus}`}>{saveStatus === 'saved' ? '● saved' : '○ saving…'}</span>
      </div>
      {aiStatus && <div className="ai-status-bar">{aiStatus}</div>}
      <textarea ref={titleRef} className="note-title" placeholder="Untitled" value={title} onChange={e => onTitleChange(e.target.value)} onKeyDown={onTitleKeyDown} rows={1} />
      <textarea ref={bodyRef} className="note-body" placeholder="Start writing…" value={body} onChange={e => onBodyChange(e.target.value)} />

      <div style={{ padding: '0 20px 20px' }}>
        {isLinkLoading && <div style={{ fontSize: '12px', color: '#888' }}>Checking link...</div>}
        {linkPreview && (
          <div style={{ display: 'flex', maxWidth: '500px', border: '1px solid #e5dfd0', borderRadius: '8px', backgroundColor: '#fff', overflow: 'hidden', marginTop: '10px' }}>
            <div style={{ flex: 1, padding: '12px', minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkPreview.title}</div>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>{linkPreview.domain}</div>
              <button onClick={onExtract} style={{ fontSize: '11px', padding: '5px 10px', backgroundColor: '#e5dfd0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                Clip Page Text
              </button>
            </div>
            {linkPreview.image && <div style={{ width: '100px', minWidth: '100px' }}><img src={linkPreview.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="preview" /></div>}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Main App ---
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
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
  
  const [linkPreview, setLinkPreview] = useState<any | null>(null);
  const [isLinkLoading, setIsLinkLoading] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<any>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId])
  useEffect(() => { 
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, [supabase.auth])

  useEffect(() => { 
    if (user) {
        fetch('/api/notes').then(res => res.json()).then(data => {
            setNotes(data);
            if (data.length > 0) openNote(data[0]);
        });
    } else {
        const gn = loadGuest(); setNotes(gn);
        if (gn.length > 0) openNote(gn[0]);
    }
  }, [user])

  function openNote(n: Note) {
    setActiveId(n.id); setTitle(n.title); setBody(n.body);
    setStartedAt(n.started_at || null);
    setWordCount(n.body.trim() ? n.body.trim().split(/\s+/).length : 0);
    setMobileView('editor'); setLinkPreview(null);
  }

  const doSave = useCallback(async (t: string, b: string) => {
    const id = activeIdRef.current; if (!id) return;
    if (user && !id.startsWith('temp-')) {
      await fetch(`/api/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t, body: b }) });
    }
    setNotes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, title: t, body: b, updated_at: new Date().toISOString() } : n);
      if (!user) saveGuest(updated);
      return updated;
    });
    setSaveStatus('saved');
  }, [user]);

  function scheduleSave(t: string, b: string) {
    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(t, b), 800);
  }

  function onBodyChange(v: string) {
    setBody(v); setWordCount(v.trim() ? v.trim().split(/\s+/).length : 0);
    scheduleSave(title, v);
    
    // LINK DETECTION LOGIC
    const match = v.match(/(https?:\/\/[^\s]+)/);
    if (match) {
        const url = match[0];
        if (!linkPreview || linkPreview.url !== url) {
            setIsLinkLoading(true);
            fetch('/api/link-preview', { method: 'POST', body: JSON.stringify({ url }) })
              .then(res => res.json())
              .then(data => { if (data.title) setLinkPreview(data); setIsLinkLoading(false); })
              .catch(() => setIsLinkLoading(false));
        }
    } else {
        setLinkPreview(null);
    }
  }

  async function handleExtract() {
    if (!linkPreview?.fullContent) return;
    if (linkPreview.fullContent.includes("Access Error")) {
        alert("This website is protected and cannot be clipped."); return;
    }
    const newBody = body + `\n\n--- Content from ${linkPreview.domain} ---\n` + linkPreview.fullContent;
    setBody(newBody); scheduleSave(title, newBody); setLinkPreview(null);
  }

  async function handleSummarize() {
    setAiStatus('✦ Summarizing…');
    const res = await fetch('/api/summarize', { method: 'POST', body: JSON.stringify({ title, body }) });
    const data = await res.json();
    const newBody = body + '\n\n─── AI Summary ───\n' + data.summary;
    setBody(newBody); scheduleSave(title, newBody); setAiStatus('');
  }

  async function newNote() {
    const now = new Date().toISOString(); const tempId = `temp-${Date.now()}`;
    const tempNote = { id: tempId, title: '', body: '', created_at: now, updated_at: now, synced: false };
    setNotes([tempNote, ...notes]); openNote(tempNote);
  }

  const handleDelete = async (id: string, e: any) => {
    e.stopPropagation();
    if (user && !id.startsWith('temp-')) await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    const updated = notes.filter(n => n.id !== id); setNotes(updated);
    if (updated.length > 0) openNote(updated[0]); else setMobileView('list');
  };

  const signOut = async () => { await supabase.auth.signOut(); setNotes(loadGuest()); setMobileView('list'); };

  return (
    <>
      <div className="mobile-header">
        {mobileView === 'list' ? (
          <div className="mobile-header-brand">Notely. <button onClick={newNote}>+</button></div>
        ) : (
          <button onClick={() => setMobileView('list')}>← Back</button>
        )}
      </div>
      <div className="app">
        <aside className={`sidebar ${mobileView === 'list' ? 'open' : ''}`}>
          <div className="sidebar-header">Notely. <button onClick={newNote}>New</button></div>
          <div className="notes-list">
            {notes.map(n => (
              <div key={n.id} className={`note-item ${n.id === activeId ? 'active' : ''}`} onClick={() => openNote(n)}>
                {n.title || 'Untitled'}
              </div>
            ))}
          </div>
          <div className="sidebar-footer">
            {user ? <button onClick={signOut}>Sign Out</button> : <button onClick={() => setShowModal(true)}>Sign In</button>}
          </div>
        </aside>
        <main className="editor-area">
          <Editor activeId={activeId} title={title} body={body} startedAt={startedAt} saveStatus={saveStatus} wordCount={wordCount} aiStatus={aiStatus} onTitleChange={setTitle} onBodyChange={onBodyChange} onDelete={handleDelete} onSummarize={handleSummarize} onExport={() => {}} bodyRef={bodyRef} titleRef={titleRef} linkPreview={linkPreview} isLinkLoading={isLinkLoading} onExtract={handleExtract} />
        </main>
      </div>
    </>
  )
}
