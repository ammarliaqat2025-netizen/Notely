'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { User } from '@supabase/supabase-js'

// --- TypeScript Rules (Strictly Defined) ---
interface Note {
  id: string; 
  user_id?: string; 
  title: string; 
  body: string; 
  created_at: string; 
  updated_at: string; 
  started_at?: string; 
  synced?: boolean;
}

interface PreviewData {
  title: string;
  domain: string;
  url: string;
  image?: string;
  fullContent?: string;
}

interface EditorProps {
  activeId: string | null;
  title: string;
  body: string;
  saveStatus: 'saved' | 'saving';
  wordCount: number;
  aiStatus: string;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onDelete: (id: string, e: any) => void;
  onSummarize: () => void;
  onExport: () => void;
  bodyRef: React.RefObject<HTMLTextAreaElement | null>;
  titleRef: React.RefObject<HTMLTextAreaElement | null>;
  linkPreviews: PreviewData[];
  isLinkLoading: boolean;
  onExtract: (lp: PreviewData) => void;
}

// --- Formatters ---
function fmtDate(iso: string) {
  const d = new Date(iso); 
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function exportTxt(title: string, body: string) {
  const content = `${title || 'Untitled'}\n${'─'.repeat(40)}\n${body}`;
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); 
  a.href = url; 
  a.download = `${(title || 'note').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`; 
  a.click(); 
  URL.revokeObjectURL(url);
}

// --- Sub-Components ---
function NotesList({ notes, activeId, onOpen, onDelete, className }: any) {
  return (
    <div className={className}>
      {notes.length === 0 ? <div className="empty-list">No notes yet.</div> : notes.map((n: Note) => (
          <div key={n.id} className={`note-item ${n.id === activeId ? 'active' : ''}`} onClick={() => onOpen(n)}>
            <div className="note-item-title">{n.title || 'Untitled'}</div>
            <div className="note-item-preview">{n.body.slice(0, 60) || '—'}</div>
            <div className="note-item-date">{fmtDate(n.updated_at)}</div>
            <button className="note-del" onClick={e => onDelete(n.id, e)}>×</button>
          </div>
      ))}
    </div>
  )
}

function Editor({ activeId, title, body, saveStatus, wordCount, aiStatus, onTitleChange, onBodyChange, onDelete, onSummarize, onExport, bodyRef, titleRef, linkPreviews, isLinkLoading, onExtract }: EditorProps) {
  if (!activeId) return <div className="empty-editor"><p>Select a note or create one</p></div>

  return (
    <div className="editor-wrap">
      <div className="toolbar">
        <button className="tool-btn" onClick={e => onDelete(activeId, e)}>Delete</button>
        <div className="tool-sep" />
        <button className="tool-btn ai-btn" onClick={onSummarize}>Summarize</button>
        <button className="tool-btn ai-btn" onClick={onExport}>Export</button>
        <span className="word-count">{wordCount}w</span>
        <span className={`save-status ${saveStatus}`}>{saveStatus === 'saved' ? '● saved' : '○ saving…'}</span>
      </div>
      {aiStatus && <div className="ai-status-bar">{aiStatus}</div>}
      <textarea ref={titleRef} className="note-title" placeholder="Untitled" value={title} onChange={e => onTitleChange(e.target.value)} rows={1} />
      <textarea ref={bodyRef} className="note-body" placeholder="Start writing…" value={body} onChange={e => onBodyChange(e.target.value)} />

      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {isLinkLoading && <div style={{ fontSize: '12px', color: '#888' }}>Checking links...</div>}
        {linkPreviews.map((lp: PreviewData) => (
          <div key={lp.url} style={{ display: 'flex', maxWidth: '500px', border: '1px solid #e5dfd0', borderRadius: '8px', backgroundColor: '#fff', overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: '12px', minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#000' }}>{lp.title}</div>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>{lp.domain}</div>
              <button onClick={() => onExtract(lp)} style={{ fontSize: '11px', padding: '5px 10px', backgroundColor: '#e5dfd0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: '#4a4439' }}>Clip Page Text</button>
            </div>
            {lp.image && <div style={{ width: '100px', minWidth: '100px' }}><img src={lp.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /></div>}
          </div>
        ))}
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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [wordCount, setWordCount] = useState(0);
  const [aiStatus, setAiStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
  
  const [linkPreviews, setLinkPreviews] = useState<PreviewData[]>([]);
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
    const gn = JSON.parse(localStorage.getItem('notely_notes') || '[]');
    if (user) {
      fetch('/api/notes').then(res => res.json()).then(data => { setNotes(data); if (data.length > 0) openNote(data[0]); });
    } else {
      setNotes(gn); if (gn.length > 0) openNote(gn[0]);
    }
  }, [user])

  function openNote(n: Note) {
    setActiveId(n.id); setTitle(n.title); setBody(n.body);
    setWordCount(n.body.trim() ? n.body.trim().split(/\s+/).length : 0);
    setSaveStatus('saved'); setMobileView('editor'); setLinkPreviews([]);
  }

  const doSave = useCallback(async (t: string, b: string) => {
    const id = activeIdRef.current; if (!id) return;
    if (user && !id.startsWith('temp-')) {
      await fetch(`/api/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t, body: b }) });
    }
    setNotes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, title: t, body: b, updated_at: new Date().toISOString() } : n);
      if (!user) localStorage.setItem('notely_notes', JSON.stringify(updated));
      return updated;
    });
    setSaveStatus('saved');
  }, [user]);

  function scheduleSave(t: string, b: string) {
    setSaveStatus('saving'); if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(t, b), 800);
  }

  function onBodyChange(v: string) {
    setBody(v); setWordCount(v.trim() ? v.trim().split(/\s+/).length : 0);
    scheduleSave(title, v);

    const foundMatches = v.match(/(https?:\/\/[^\s]+)/g);
    const matches: string[] = foundMatches ? Array.from(foundMatches) : [];
    
    // TYPED FIX: Ensure compiler knows we are comparing strings
    setLinkPreviews((prev: PreviewData[]) => prev.filter((lp: PreviewData) => matches.includes(lp.url)));

    matches.forEach(url => {
        const alreadyFetched = linkPreviews.find((lp: PreviewData) => lp.url === url);
        if (!alreadyFetched) fetchPreview(url);
    });
  }

  async function fetchPreview(url: string) {
    setIsLinkLoading(true);
    try {
      const res = await fetch('/api/link-preview', { method: 'POST', body: JSON.stringify({ url }) });
      const data = await res.json(); 
      if (data.title) {
        setLinkPreviews((prev: PreviewData[]) => {
            if (prev.find((lp: PreviewData) => lp.url === url)) return prev;
            return [...prev, data as PreviewData];
        });
      }
    } catch (e) {} finally { setIsLinkLoading(false); }
  }

  async function handleExtract(lp: PreviewData) {
    setAiStatus('✦ Extracting...');
    try {
      const res = await fetch('/api/link-preview', { method: 'POST', body: JSON.stringify({ url: lp.url }) });
      const data = await res.json();
      if (!res.ok) { alert(data.error); setAiStatus(''); return; }
      const newBody = body + `\n\n--- Content from ${data.domain} ---\n` + (data.fullContent || '');
      setBody(newBody); scheduleSave(title, newBody);
      setLinkPreviews((prev: PreviewData[]) => prev.filter((p: PreviewData) => p.url !== lp.url));
      setAiStatus('');
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
    const tempNote: Note = { id: tempId, title: '', body: '', created_at: now, updated_at: now, synced: false };
    setNotes(prev => [tempNote, ...prev]); openNote(tempNote);
  }

  const handleDelete = async (id: string, e: any) => {
    e.stopPropagation();
    if (user && !id.startsWith('temp-')) await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    setNotes(prev => {
        const updated = prev.filter(n => n.id !== id);
        if (updated.length > 0) openNote(updated[0]); else setMobileView('list');
        return updated;
    });
  };

  const handleAuth = async () => {
    if (authMode === 'signin') await supabase.auth.signInWithPassword({ email, password });
    else await supabase.auth.signUp({ email, password });
    setShowModal(false);
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
        <aside className="sidebar">
          <div className="sidebar-header"><div className="brand">Notely.</div><button className="new-btn" onClick={newNote}>New note</button></div>
          <NotesList notes={notes} activeId={activeId} onOpen={openNote} onDelete={handleDelete} className="notes-list" />
          <div className="sidebar-footer">
            {user ? <button className="auth-btn" onClick={() => supabase.auth.signOut()}>sign out</button> : <button className="auth-btn" onClick={() => setShowModal(true)}>sign in</button>}
          </div>
        </aside>
        <main className="editor-area">
          {mobileView === 'list' ? <NotesList notes={notes} activeId={activeId} onOpen={openNote} onDelete={handleDelete} className="mobile-notes-panel" /> : (
            <Editor activeId={activeId} title={title} body={body} saveStatus={saveStatus} wordCount={wordCount} aiStatus={aiStatus} onTitleChange={setTitle} onBodyChange={onBodyChange} onDelete={handleDelete} onSummarize={handleSummarize} onExport={() => exportTxt(title, body)} bodyRef={bodyRef} titleRef={titleRef} linkPreviews={linkPreviews} isLinkLoading={isLinkLoading} onExtract={handleExtract} />
          )}
        </main>
      </div>
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button onClick={() => setAuthMode('signin')}>Sign in</button>
            <button onClick={() => setAuthMode('signup')}>Sign up</button>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
            <button onClick={handleAuth}>Go</button>
          </div>
        </div>
      )}
    </>
  )
}
