import React, { useState, useEffect } from 'react';
import { MessageSquare, BookOpen, LayoutGrid, BrainCircuit, ShieldAlert, LogOut, ChevronRight, HelpCircle, FileSearch, Columns3 } from 'lucide-react';
import { Paper, AuthUser } from './types.js';
import AskQuestionTab from './components/AskQuestionTab.tsx';
import LibraryTab from './components/LibraryTab.tsx';
import DashboardTab from './components/DashboardTab.tsx';
import SummarizeTab from './components/SummarizeTab.tsx';
import ComparePapersTab from './components/ComparePapersTab.tsx';
import LoginScreen from './components/LoginScreen.tsx';

export type TabId = 'ask' | 'library' | 'dashboard' | 'summarize' | 'compare';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [summarizePaperId, setSummarizePaperId] = useState<string | null>(null);

  // Real session state — resolved from an httpOnly cookie via /api/auth/me.
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // On load, check whether we already have a valid session (Google or
  // guest). Only fetch the user's papers once we know who they are.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          await fetchPapers();
        }
      } catch (err) {
        console.error('Error checking session:', err);
      } finally {
        setIsCheckingSession(false);
      }
    })();
  }, []);

  const fetchPapers = async () => {
    try {
      const response = await fetch('/api/papers', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setPapers(data);
        // By default, select all papers
        setSelectedPaperIds(data.map((p: Paper) => p.id));
      }
    } catch (err) {
      console.error('Error loading papers:', err);
    }
  };

  const handleAuthenticated = async (authedUser: AuthUser) => {
    setUser(authedUser);
    await fetchPapers();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Error logging out:', err);
    } finally {
      // Reset all workspace state — the next sign-in may be a different user.
      setUser(null);
      setPapers([]);
      setSelectedPaperIds([]);
      setSummarizePaperId(null);
      setActiveTab('dashboard');
    }
  };

  const handleUploadSuccess = (newPaper: Paper) => {
    setPapers(prev => [newPaper, ...prev]);
    // Automatically select the newly uploaded paper
    setSelectedPaperIds(prev => [...prev, newPaper.id]);
  };

  const handleDeleteSuccess = (deletedPaperId: string) => {
    setPapers(prev => prev.filter(p => p.id !== deletedPaperId));
    setSelectedPaperIds(prev => prev.filter(id => id !== deletedPaperId));
  };

  const handleSelectPaperForChat = (paperId: string) => {
    // Select ONLY this paper and switch to the Ask tab
    setSelectedPaperIds([paperId]);
    setActiveTab('ask');
  };

  const handleSelectPaperForSummary = (paperId: string) => {
    setSummarizePaperId(paperId);
    setActiveTab('summarize');
  };

  const handleTogglePaperSelection = (paperId: string) => {
    setSelectedPaperIds(prev => {
      if (prev.includes(paperId)) {
        return prev.filter(id => id !== paperId);
      } else {
        return [...prev, paperId];
      }
    });
  };

  // Get user initials for the sidebar avatar
  const getInitials = (name: string) => {
    if (!name) return 'GS';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // While we don't yet know if there's a valid session, show a minimal loader.
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[#f7f6f3] flex flex-col items-center justify-center py-24 text-center">
        <BrainCircuit className="h-10 w-10 text-[#1a56db] animate-bounce mb-3" />
        <h2 className="text-lg font-display font-bold text-stone-800">Checking your session...</h2>
      </div>
    );
  }

  // No valid session — show the real sign-in screen (Google OAuth or guest).
  if (!user) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="min-h-screen bg-[#f7f6f3] text-stone-800 font-sans flex flex-col md:flex-row antialiased">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-stone-200/60 flex flex-col justify-between shrink-0" id="sidebar-panel">
        
        {/* Top brand header */}
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-[#1a56db] rounded-xl flex items-center justify-center text-white shadow-md">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold tracking-tight text-stone-900 leading-tight">
                ScholarMind
              </h1>
              <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-stone-400">
                FYP RAG Indexer
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-8 space-y-1.5" id="sidebar-nav">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-[#e9effd] text-[#1a56db]'
                  : 'hover:bg-stone-50 text-stone-600 hover:text-stone-900'
              }`}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab('ask')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'ask'
                  ? 'bg-[#e9effd] text-[#1a56db]'
                  : 'hover:bg-stone-50 text-stone-600 hover:text-stone-900'
              }`}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              Ask a question
            </button>

            <button
              onClick={() => setActiveTab('library')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'library'
                  ? 'bg-[#e9effd] text-[#1a56db]'
                  : 'hover:bg-stone-50 text-stone-600 hover:text-stone-900'
              }`}
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              Library
              {papers.length > 0 && (
                <span className="ml-auto bg-stone-100 group-hover:bg-stone-200 text-stone-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {papers.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('summarize')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'summarize'
                  ? 'bg-[#e9effd] text-[#1a56db]'
                  : 'hover:bg-stone-50 text-stone-600 hover:text-stone-900'
              }`}
            >
              <FileSearch className="h-4 w-4 shrink-0" />
              Summarize paper
            </button>

            <button
              onClick={() => setActiveTab('compare')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'compare'
                  ? 'bg-[#e9effd] text-[#1a56db]'
                  : 'hover:bg-stone-50 text-stone-600 hover:text-stone-900'
              }`}
            >
              <Columns3 className="h-4 w-4 shrink-0" />
              Compare papers
            </button>
          </nav>
        </div>

        {/* Profile Card — reflects the real signed-in user (Google or guest) */}
        <div className="p-4 border-t border-stone-200/50 bg-stone-50/50">
          <div className="flex items-center gap-3 justify-between" id="signed-in-profile">
            <div className="flex items-center gap-2.5 min-w-0">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="h-9 w-9 rounded-full object-cover shrink-0 shadow-sm"
                />
              ) : (
                <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${
                  user.isGuest ? 'bg-stone-200 text-stone-600' : 'bg-[#1a56db] text-white'
                }`}>
                  {getInitials(user.name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-stone-900 truncate">
                  {user.name}
                </p>
                <p className="text-[10px] text-stone-500 truncate">
                  {user.isGuest ? 'Guest session (not saved to an account)' : user.email}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 text-stone-400 hover:text-red-500 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer shrink-0"
              title={user.isGuest ? 'End guest session' : 'Sign out'}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Screen Workspace View */}
      <main className="grow flex flex-col p-6 md:p-8 max-w-5xl mx-auto w-full min-h-0 overflow-y-auto">
        {/* View Tab Routing */}
        {activeTab === 'dashboard' && (
          <DashboardTab
            papers={papers}
            onSwitchTab={setActiveTab}
            onSelectPaperForChat={handleSelectPaperForChat}
            studentName={user.name}
          />
        )}

        {activeTab === 'ask' && (
          <AskQuestionTab
            papers={papers}
            selectedPaperIds={selectedPaperIds}
            onTogglePaperSelection={handleTogglePaperSelection}
            onSwitchTab={setActiveTab}
            studentName={user.name}
          />
        )}

        {activeTab === 'library' && (
          <LibraryTab
            papers={papers}
            onUploadSuccess={handleUploadSuccess}
            onDeleteSuccess={handleDeleteSuccess}
            onSelectPaperForChat={handleSelectPaperForChat}
            onSelectPaperForSummary={handleSelectPaperForSummary}
          />
        )}

        {activeTab === 'summarize' && (
          <SummarizeTab
            papers={papers}
            initialPaperId={summarizePaperId}
            onSwitchTab={setActiveTab}
          />
        )}

        {activeTab === 'compare' && (
          <ComparePapersTab
            papers={papers}
            onSwitchTab={setActiveTab}
          />
        )}
      </main>
    </div>
  );
}
