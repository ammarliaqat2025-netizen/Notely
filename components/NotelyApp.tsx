"use client";

import React, { useState } from 'react';
import { 
  Plus, Trash2, Search, Clock, Sparkles, X, 
  Loader2, Undo2, Download, Menu 
} from 'lucide-react';

interface NoteVersion { content: string; timestamp: number; }
interface Note { id: string; title: string; body: string; lastModified: number; history: NoteVersion[]; }

export default function NotelyApp() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [travelIndex, setTravelIndex] = useState<number>(-1);

  const activeNote = notes.find(n => n.id === activeNoteId);
  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const createNote = () => {
    const newNote: Note = {
      id: Date.now().toString(), title: '', body: '', lastModified: Date.now(),
      history: [{ content: '', timestamp: Date.now() }]
    };
    setNotes([newNote, ...notes]);
    setActiveNoteId(newNote.id);
    setTravelIndex(0);
  };

  const updateNote = (field: 'title' | 'body', value: string) => {
    if (!activeNoteId) return;
    setNotes(prev => prev.map(n => {
      if (n.id === activeNoteId) {
        const updated = { ...n, [field]: value, lastModified: Date.now() };
        if (field === 'body' && value.length % 20 === 0) {
          updated.history = [...n.history, { content: value, timestamp: Date.now() }];
          setTravelIndex(updated.history.length - 1);
        }
        return updated;
      }
      return n;
    }));
  };

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    if (activeNoteId === id) setActiveNoteId(null);
  };

  return (
    <div className="app">
      <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="brand">Notely<span className="brand-dot">.</span></div>
          <div className="brand-sub">just write — nothing else</div>
          <button className="new-btn" onClick={createNote}><Plus size={16} /> <span>New note</span></button>
        </div>
        <div className="search-container">
          <input className="search-input" placeholder="Search notes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="notes-list">
          {filteredNotes.length === 0 ? <div className="empty-list">No notes yet.<br />Hit + to begin.</div> : 
            filteredNotes.map(note => (
              <div key={note.id} className={`note-item ${activeNoteId === note.id ? 'active' : ''}`} onClick={() => { setActiveNoteId(note.id); setTravelIndex(note.history.length - 1); }}>
                <div className="note-item-title">{note.title || 'Untitled'}</div>
              </div>
            ))
          }
        </div>
        <div className="sidebar-footer">
          <div className="user-badge">Ammar Liaqat</div>
          <button className="tool-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}><Menu size={18} /></button>
        </div>
      </aside>

      <main className="editor-area">
        {activeNote ? (
          <>
            <div className="toolbar">
              <button className="tool-btn"><Undo2 size={18} /></button>
              <button className="tool-btn" onClick={() => {}}><Download size={18} /></button>
              <button className="tool-btn" onClick={() => deleteNote(activeNote.id)}><Trash2 size={18} /></button>
              <button className="tool-btn ai-btn" onClick={() => { setIsSummarizing(true); setTimeout(() => { setSummary("This note focuses on the royal aesthetic and narrative-driven storytelling for the Zururi brand."); setIsSummarizing(false); }, 1000); }}>
                {isSummarizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} <span>AI Summary</span>
              </button>
            </div>
            
            <input className="note-title" placeholder="Title" value={activeNote.title} onChange={(e) => updateNote('title', e.target.value)} />
            
            <textarea 
              className="note-body" 
              placeholder="Start writing..." 
              value={travelIndex !== -1 && activeNote.history[travelIndex] ? activeNote.history[travelIndex].content : activeNote.body}
              onChange={(e) => updateNote('body', e.target.value)}
            />

            {/* THE PILL BAR */}
            <div className="time-travel-bar">
              <span className="time-travel-label">Time Travel</span>
              <input type="range" className="time-travel-scrubber" min="0" max={activeNote.history.length - 1} value={travelIndex} onChange={(e) => setTravelIndex(parseInt(e.target.value))} />
              <div className="time-travel-icon"><Clock size={16} /></div>
            </div>
          </>
        ) : (
          <div className="empty-list" style={{fontSize: '20px'}}>Select a note to begin.</div>
        )}

        {summary && (
          <div style={{position: 'absolute', right: 0, top: 0, bottom: 0, width: '320px', background: '#f5f0e8', borderLeft: '1px solid rgba(0,0,0,0.1)', zIndex: 100, display: 'flex', flexDirection: 'column'}}>
            <div style={{padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <b style={{fontSize: '18px'}}>Summary</b>
              <button onClick={() => setSummary(null)} style={{background:'none', border:'none', cursor: 'pointer'}}><X size={20}/></button>
            </div>
            <div style={{padding: '24px', fontStyle: 'italic', lineHeight: '1.6'}}>{summary}</div>
          </div>
        )}
      </main>
    </div>
  );
}
