"use client";

import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Search, Clock, Sparkles, X, 
  Loader2, Undo2, Download, Menu 
} from 'lucide-react';

// --- Types ---
interface NoteVersion {
  content: string;
  timestamp: number;
}

interface Note {
  id: string;
  title: string;
  body: string;
  lastModified: number;
  history: NoteVersion[];
}

export default function NotelyApp() {
  // --- State ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [travelIndex, setTravelIndex] = useState<number>(-1);

  // --- Derived Data ---
  const activeNote = notes.find(n => n.id === activeNoteId);
  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- Handlers ---
  const createNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: '',
      body: '',
      lastModified: Date.now(),
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
        // Create history snapshot every 20 characters to keep it clean
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

  const exportNote = () => {
    if (!activeNote) return;
    const blob = new Blob([activeNote.body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeNote.title || 'Untitled'}.txt`;
    a.click();
  };

  const handleSummarize = () => {
    if (!activeNote || activeNote.body.length < 10) return;
    setIsSummarizing(true);
    setTimeout(() => {
      setSummary("Your note focuses on structural organization and creative workflows. It maintains a clean, minimalist aesthetic suitable for high-level consulting.");
      setIsSummarizing(false);
    }, 1200);
  };

  return (
    <div className="app">
      {/* Sidebar Section */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">Notely<span className="brand-dot">.</span></div>
          <div className="brand-sub">just write — nothing else</div>
          <button className="new-btn" onClick={createNote}>
            <Plus size={16} /> <span>New note</span>
          </button>
        </div>

        <div className="search-container">
          <input 
            className="search-input" 
            placeholder="Search notes..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="notes-list">
          {filteredNotes.length === 0 ? (
            <div className="empty-list">
              No notes yet.<br />Hit + to begin.
            </div>
          ) : (
            filteredNotes.map(note => (
              <div 
                key={note.id} 
                className={`note-item ${activeNoteId === note.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveNoteId(note.id);
                  setTravelIndex(note.history.length - 1);
                }}
              >
                <div className="note-item-title">{note.title || 'Untitled'}</div>
                <div className="note-item-preview">{note.body || 'No content...'}</div>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <div className="user-badge">Ammar Liaqat</div>
          <button className="tool-btn" title="Menu" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <Menu size={16} />
          </button>
        </div>
      </aside>

      {/* Main Editor Section */}
      <main className="editor-area">
        {activeNote ? (
          <>
            <div className="toolbar">
              <button className="tool-btn" title="Undo"><Undo2 size={18} /></button>
              <button className="tool-btn" title="Export" onClick={exportNote}><Download size={18} /></button>
              <button className="tool-btn" title="Delete" onClick={() => deleteNote(activeNote.id)}><Trash2 size={18} /></button>
              <div className="tool-sep" />
              <button className="tool-btn ai-btn" onClick={handleSummarize} disabled={isSummarizing}>
                {isSummarizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                <span>AI Summary</span>
              </button>
            </div>

            <input 
              className="note-title" 
              placeholder="Title" 
              value={activeNote.title} 
              onChange={(e) => updateNote('title', e.target.value)} 
            />
            
            <textarea 
              className="note-body" 
              placeholder="Start writing..." 
              value={travelIndex !== -1 && activeNote.history[travelIndex] ? activeNote.history[travelIndex].content : activeNote.body}
              onChange={(e) => updateNote('body', e.target.value)}
            />

            {/* Permanent Time Travel Bar */}
            <div className="time-travel-bar">
              <span className="time-travel-label">Time Travel</span>
              <input 
                type="range" 
                className="time-travel-scrubber" 
                min="0" 
                max={activeNote.history.length - 1} 
                value={travelIndex} 
                onChange={(e) => setTravelIndex(parseInt(e.target.value))} 
              />
              <Clock size={16} color="#9a9080" />
            </div>
          </>
        ) : (
          <div className="empty-list" style={{ fontSize: '18px' }}>
            Select a note or create a new one to begin.
          </div>
        )}

        {/* AI Summary Sidebar */}
        {summary && (
          <div className="summary-sidebar">
            <div className="summary-header">
              <span className="summary-label">Summary</span>
              <button className="tool-btn" onClick={() => setSummary(null)}><X size={20} /></button>
            </div>
            <div className="summary-content">{summary}</div>
          </div>
        )}
      </main>
    </div>
  );
}
