'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import type { User } from '@supabase/supabase-js'

// ... Keep existing Note, PreviewData interfaces and fmt functions ...

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
  onDigest: (lp: PreviewData) => void // New Feature 2
  aiSummary: string
  onClearSummary: () => void
  history: string[] // New Feature 3
  historyIndex: number
  onHistoryChange: (idx: number) => void
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
      <div className="editor-main-column" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', borderRight: aiSummary ? '1px solid #eee' : 'none', position: 'relative' }}>
        <div className="toolbar">
          <button className="tool-btn" title="Delete note" onClick={e => onDelete(activeId, e)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3.5h9M5 3.5V2.5h3v1M5.5 6v4M7.5 6v4M3 3.5l.7 7h5.6l.7-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="tool-sep" />
          <button className="tool-btn ai-btn" title="Summarize with AI" onClick={onSummarize} disabled={!body.trim() || !!aiSummary}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1.5l1 2.5h2.5l-2 1.5.8 2.5-2.3-1.5-2.3 1.5.8-2.5-2-1.5H5.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            </svg>
            Summarize
          </button>
          <button className="tool-btn ai-btn" title="Export as .txt" onClick={onExport}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M8 1.5H4a1 1 0 00-1 1v8a1 1 0 001 1h5a1 1 0 001-1V4.5L8 1.5z" stroke="currentColor" strokeWidth="1.1"/>
            </svg>
            Export
          </button>
          <span className="word-count">{wordCount}w</span>
          <span className={`save-status ${saveStatus}`}>{saveStatus === 'saved' ? '● saved' : '○ saving…'}</span>
        </div>

        {aiStatus && <div className="ai-status-bar">{aiStatus}</div>}
        
        {startedAt && (
          <div className="note-timestamp">⏱ {fmtTime(startedAt)} · {fmtFull(startedAt)}</div>
        )}
        
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
          value={body}
          onChange={e => onBodyChange(e.target.value)}
        />

        {/* FEATURE 2: SELECTIVE CLIP (UI) */}
        <div className="link-previews-container" style={{ padding: '0 24px 32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isLinkLoading && <div style={{ fontSize: '11px', letterSpacing: '0.05em', color: '#a0a0a0', textTransform: 'uppercase' }}>Scanning links...</div>}
          {linkPreviews.map((lp, idx) => (
            <div key={lp.url + idx} className="link-card" style={{ display: 'flex', maxWidth: '540px', border: '1px solid #eee', borderRadius: '4px', backgroundColor: '#fafaf9', overflow: 'hidden' }}>
              <div style={{ flex: 1, padding: '16px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lp.title}</div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px', fontStyle: 'italic' }}>{lp.domain}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => onExtract(lp)} style={{ fontSize: '10px', padding: '6px 12px', backgroundColor: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer', fontWeight: '500', textTransform: 'uppercase' }}>Clip Page</button>
                  <button onClick={() => onDigest(lp)} style={{ fontSize: '10px', padding: '6px 12px', backgroundColor: 'transparent', color: '#b5541c', border: '1px solid #b5541c', borderRadius: '2px', cursor: 'pointer', fontWeight: '500', textTransform: 'uppercase' }}>Digest</button>
                  <button onClick={() => window.open(lp.url, '_blank')} style={{ fontSize: '10px', padding: '6px 12px', backgroundColor: 'transparent', color: '#666', border: '1px solid #ddd', borderRadius: '2px', cursor: 'pointer' }}>Visit</button>
                </div>
              </div>
              {lp.image && <div style={{ width: '120px', minWidth: '120px' }}><img src={lp.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /></div>}
            </div>
          ))}
        </div>

        {/* FEATURE 3: TACTICAL TIME-TRAVEL (UI) */}
        {history.length > 1 && (
          <div className="time-travel-bar">
            <span className="history-label">History</span>
            <input 
              type="range" 
              min="0" 
              max={history.length - 1} 
              value={historyIndex} 
              onChange={(e) => onHistoryChange(parseInt(e.target.value))} 
              className="history-scrubber"
            />
          </div>
        )}
      </div>

      {aiSummary && (
        <aside className="summary-sidebar">
          <div className="summary-header">
            <span className="summary-label">Ai summary</span>
            <button className="summary-close" onClick={onClearSummary}>✕</button>
          </div>
          <div className="summary-content">
            {aiSummary}
          </div>
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

  // FEATURE 3 STATES
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

  // FEATURE 1: DEEP LINKS (Listening for highlights)
  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection()?.toString();
      if (selection && selection.length > 5) {
        const matches = notes.filter(n => 
          n.id !== activeId && 
          (n.body.toLowerCase().includes(selection.toLowerCase()) || 
           n.title.toLowerCase().includes(selection.toLowerCase()))
        ).slice(0, 3);

        if (matches.length > 0) {
          const context = `Potential Connections:\n\n` + 
            matches.map(m => `• ${m.title || 'Untitled'}\n  "${m.body.slice(0, 100)}..."`).join('\n\n');
          setAiSummary(context);
        }
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [notes, activeId]);

  // FEATURE 3: LOGGING HISTORY
  useEffect(() => {
    if (saveStatus === 'saved' && body && history[history.length - 1] !== body) {
      setHistory(prev => [...prev.slice(-19), body]);
      setHistoryIndex(prev => Math.min(prev + 1, 19));
    }
  }, [saveStatus]);

  // ... (Keep existing fetchCloud, newNote, openNote, fetchPreview) ...

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

  async function handleDigest(lp: PreviewData) {
    setAiStatus('✦ Digesting...');
    try {
      const res = await fetch('/api/summarize', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: lp.title, body: lp.fullContent }) 
      });
      const data = await res.json();
      const divider = `\n\n─── ${lp.domain.toUpperCase()} DIGEST ───\n`;
      const newBody = body + divider + data.summary + '\n';
      setBody(newBody); scheduleSave(title, newBody, startedAt);
      setAiStatus('');
    } catch { setAiStatus('✦ Failed'); setTimeout(() => setAiStatus(''), 3000); }
  }

  // ... (Keep existing handleSummarize, handleDelete, handleAuth) ...

  return (
    <>
      {/* ... Keep mobile-header and sidebar ... */}
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
      {/* ... Keep showModal overlay ... */}
    </>
  )
}
