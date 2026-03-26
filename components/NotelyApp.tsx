import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Search, 
  Clock, 
  Sparkles, 
  ChevronRight, 
  LogOut, 
  Menu, 
  X,
  Loader2,
  Undo2
} from 'lucide-react';

// --- TYPES ---
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
  // --- STATE ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [travelIndex, setTravelIndex] = useState<number>(-1);

  // --- DERIVED STATE ---
  const activeNote = notes.find(n => n.id === activeNoteId);
  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- ACTIONS ---
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
        const updatedNote = { 
          ...n, 
          [field]: value, 
          lastModified: Date.now() 
        };
        
        // Push to history if body changed significantly or every 10th char
        if (field === 'body' && value.length % 10 === 0) {
          updatedNote.history = [...n.history, { content: value, timestamp: Date.now() }];
          setTravelIndex(updatedNote.history.length - 1);
        }
        return updatedNote;
      }
      return n;
    }));
  };

  const deleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotes(prev => prev.filter(n => n.id !== id));
    if (activeNoteId === id) setActiveNoteId(null);
  };

  const handleTimeTravel = (index: number) => {
    setTravelIndex(index);
    if (activeNote) {
      const historicContent = activeNote.history[index].content;
      // We don't overwrite the actual note body here to prevent data loss,
      // but in a full implementation, you'd "Restore" this version.
    }
  };

  const generateSummary = async () => {
    if (!activeNote || activeNote.body.length < 20) return;
    setIsSummarizing(true);
    // Simulate AI Delay
    setTimeout(() => {
      setSummary(`This note explores the core concepts of your project. Key themes include efficiency, royal aesthetics for Zururi, and structural organization.`);
      setIsSummarizing(false);
    }, 1500);
  };

  return (
    <div className="app">
      {/* MOBILE HEADER */}
      <header className="mobile-header">
        <button className="mobile-btn" onClick={() => setIsSidebarOpen(true)}>
          <Menu size={20} />
        </button>
        <div className="mobile-header-brand">Notely<span>.</span></div>
        <button className="mobile-btn" onClick={createNote}>
          <Plus size={20} />
        </button>
      </header>

      {/* SIDEBAR */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">Notely<span className="brand-dot">.</span></div>
          <div className="brand-sub">just write — nothing else</div>
          
          <button className="new-btn" onClick={createNote}>
            <Plus size={16} />
            <span>New note</span>
          </button>
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
                  if (window.innerWidth < 640) setIsSidebarOpen(false);
                }}
              >
                <div className="note-item-title">{note.title || 'Untitled'}</div>
                <div className="note-item-preview">{note.body || 'No content yet...'}</div>
                <div className="note-item-date">
                  {new Date(note.lastModified).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </div>
                <button className="note-del" onClick={(e) => deleteNote(note.id, e)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <div className="user-badge">Ammar Liaqat</div>
          <button className="auth-btn">Log out</button>
        </div>
      </aside>

      {/* EDITOR AREA */}
      <main className="editor-area">
        {activeNote ? (
          <div className="editor-main-column">
            <div className="toolbar">
              <button className="tool-btn" title="Undo"><Undo2 size={16} /></button>
              <div className="tool-sep" />
              <button 
                className="tool-btn ai-btn" 
                onClick={generateSummary}
                disabled={isSummarizing}
              >
                {isSummarizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>AI Summary</span>
              </button>
              
              <div className="word-count">
                {activeNote.body.split(/\s+/).filter(Boolean).length} words
              </div>
            </div>

            {isSummarizing && <div className="ai-status-bar">AI is reading your thoughts...</div>}

            <input 
              className="note-title"
              placeholder="Title"
              value={activeNote.title}
              onChange={(e) => updateNote('title', e.target.value)}
            />
            
            <textarea 
              className="note-body"
              placeholder="Start writing..."
              value={travelIndex !== -1 && activeNote.history[travelIndex] 
                ? activeNote.history[travelIndex].content 
                : activeNote.body
              }
              onChange={(e) => updateNote('body', e.target.value)}
            />

            {/* TIME TRAVEL BAR - ALWAYS VISIBLE */}
            <div className="time-travel-bar">
              <div className="time-travel-label">Time Travel</div>
              <input 
                type="range" 
                className="time-travel-scrubber"
                min="0" 
                max={activeNote.history.length - 1} 
                value={travelIndex}
                onChange={(e) => handleTimeTravel(parseInt(e.target.value))}
              />
              <Clock size={12} color="#9a9080" />
            </div>
          </div>
        ) : (
          <div className="empty-list" style={{ fontSize: '18px' }}>
            Select a note to view or edit.
          </div>
        )}

        {/* SUMMARY DRAWER */}
        {summary && (
          <div className="summary-sidebar">
            <div className="summary-header">
              <span className="summary-label">Summary</span>
              <button className="summary-close" onClick={() => setSummary(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="summary-content">
              {summary}
            </div>
          </div>
        )}
      </main>

      {/* MOBILE OVERLAY */}
      {isSidebarOpen && window.innerWidth < 640 && (
        <div className="overlay" onClick={() => setIsSidebarOpen(false)} />
      )}
    </div>
  );
}
