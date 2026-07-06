import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, MessageSquare, AlertTriangle, RefreshCw, Trash2, BookOpen, Quote, ChevronDown, ChevronUp, CheckCircle, Plus } from 'lucide-react';
import { ChatMessage, Paper } from '../types.js';
import type { TabId } from '../App.tsx';

interface AskQuestionTabProps {
  papers: Paper[];
  selectedPaperIds: string[];
  onTogglePaperSelection: (id: string) => void;
  onSwitchTab: (tab: TabId) => void;
  studentName: string;
}

export default function AskQuestionTab({
  papers,
  selectedPaperIds,
  onTogglePaperSelection,
  onSwitchTab,
  studentName
}: AskQuestionTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [expandedCitations, setExpandedCitations] = useState<{ [messageId: string]: boolean }>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChatHistory();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const fetchChatHistory = async () => {
    try {
      const response = await fetch('/api/chat/history');
      if (response.ok) {
        const history = await response.json();
        setMessages(history);
      }
    } catch (err) {
      console.error('Error fetching chat history:', err);
    }
  };

  const handleClearHistory = async () => {
    const confirmClear = window.confirm('Are you sure you want to clear your conversation history?');
    if (!confirmClear) return;

    try {
      const response = await fetch('/api/chat/history', { method: 'DELETE' });
      if (response.ok) {
        setMessages([]);
        setExpandedCitations({});
      }
    } catch (err) {
      console.error('Error clearing history:', err);
    }
  };

  const simulateLoadingSteps = () => {
    const steps = [
      'Embedding question with gemini-embedding-2...',
      'Comparing question vector against stored paper chunks...',
      'Calculating cosine similarity & identifying top matches...',
      'Grounding prompt context inside gemini-3.5-flash...',
      'Formulating response based strictly on research context...'
    ];
    
    let currentStepIdx = 0;
    setLoadingStep(steps[currentStepIdx]);
    
    const interval = setInterval(() => {
      currentStepIdx = (currentStepIdx + 1) % steps.length;
      setLoadingStep(steps[currentStepIdx]);
    }, 1200);

    return interval;
  };

  const handleSendQuery = async (queryText: string) => {
    if (!queryText.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    const optimisticUserMsg: ChatMessage = {
      id: 'temp_user_' + Date.now(),
      role: 'user',
      content: queryText,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, optimisticUserMsg]);

    const loadingInterval = simulateLoadingSteps();

    try {
      const response = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: queryText,
          filterPaperId: selectedPaperIds.length > 0 ? selectedPaperIds.join(',') : undefined
        })
      });

      const data = await response.json();
      clearInterval(loadingInterval);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get an answer from ScholarMind.');
      }

      setMessages(prev => {
        return [...prev.filter(m => !m.id.startsWith('temp_user_')), optimisticUserMsg, data.message];
      });

      if (data.message.sources && data.message.sources.length > 0) {
        setExpandedCitations(prev => ({ ...prev, [data.message.id]: true }));
      }

    } catch (err: any) {
      clearInterval(loadingInterval);
      setError(err.message || 'An error occurred while calling the assistant.');
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp_user_')));
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const query = input.trim();
    setInput('');
    handleSendQuery(query);
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSendQuery(suggestion);
  };

  const toggleCitations = (messageId: string) => {
    setExpandedCitations(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 0.7) return 'bg-[#e6f4ea] text-[#137333] border-[#ceead6]';
    if (score >= 0.5) return 'bg-[#fef7e0] text-[#b06000] border-[#feebc8]';
    return 'bg-stone-100 text-stone-600 border-stone-200';
  };

  return (
    <div className="flex flex-col h-full shrink-0" id="ask-question-tab-container">
      {/* Top Source selection bar */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-display font-bold text-stone-900">Ask your papers</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {selectedPaperIds.length} of {papers.length} sources selected
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-600 font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>{papers.length} indexed</span>
          </div>
        </div>

        {/* Paper toggle pills */}
        <div className="flex flex-wrap items-center gap-2" id="source-pills-list">
          {papers.length === 0 ? (
            <div className="text-stone-400 text-xs py-1 italic">
              No research papers uploaded yet. Go to Library to upload and index documents.
            </div>
          ) : (
            papers.map(paper => {
              const isChecked = selectedPaperIds.includes(paper.id);
              return (
                <button
                  key={paper.id}
                  id={`pill-${paper.id}`}
                  onClick={() => onTogglePaperSelection(paper.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition-all cursor-pointer border ${
                    isChecked
                      ? 'bg-[#e9effd] text-[#1a56db] border-blue-200 shadow-sm'
                      : 'bg-white hover:bg-stone-50 text-stone-600 border-stone-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    className="h-3.5 w-3.5 rounded text-[#1a56db] focus:ring-0 cursor-pointer pointer-events-none"
                  />
                  <span className="truncate max-w-[200px]">{paper.name}</span>
                </button>
              );
            })
          )}

          <button
            onClick={() => onSwitchTab('library')}
            className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white hover:bg-stone-50 text-[#1a56db] border border-dashed border-blue-300 flex items-center gap-1 transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add source
          </button>
        </div>
      </div>

      {/* Main Chat Frame */}
      <div className="grow bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[450px]" id="chat-frame">
        {/* Messages feed */}
        <div className="grow overflow-y-auto space-y-6 max-h-[500px] pr-1 scrollbar-thin scrollbar-thumb-stone-200 scrollbar-track-transparent">
          {messages.length === 0 ? (
            /* Centered empty state illustration */
            <div className="h-full flex flex-col items-center justify-center text-center py-16" id="empty-chat-state">
              <div className="h-16 w-16 bg-[#e9effd] rounded-2xl flex items-center justify-center text-[#1a56db] mb-6 shadow-inner">
                <Plus className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-display font-bold text-stone-900">What would you like to know?</h3>
              <p className="text-sm text-stone-500 max-w-md mt-2 leading-relaxed">
                {selectedPaperIds.length > 0
                  ? `Ask across your ${selectedPaperIds.length} selected source(s) — every answer comes with citations back to the page.`
                  : 'Select sources at the top to begin querying ScholarMind. Grounded research answers are computed via AI vector matching.'}
              </p>

              {/* Suggestions chips */}
              {selectedPaperIds.length > 0 && (
                <div className="mt-8 flex flex-col items-center gap-2.5">
                  <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                    <button
                      onClick={() => handleSuggestionClick("Summarize this paper in 3 sentences")}
                      className="px-4 py-2 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-medium rounded-full border border-stone-200 transition-all cursor-pointer"
                    >
                      Summarize this paper in 3 sentences
                    </button>
                    <button
                      onClick={() => handleSuggestionClick("What methodology was used?")}
                      className="px-4 py-2 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-medium rounded-full border border-stone-200 transition-all cursor-pointer"
                    >
                      What methodology was used?
                    </button>
                  </div>
                  <button
                    onClick={() => handleSuggestionClick("List the key limitations")}
                    className="px-4 py-2 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-medium rounded-full border border-stone-200 transition-all cursor-pointer"
                  >
                    List the key limitations
                  </button>
                </div>
              )}
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  id={`message-${msg.id}`}
                  className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="h-9 w-9 rounded-xl bg-[#e9effd] flex items-center justify-center shrink-0 text-[#1a56db] mt-1 shadow-sm">
                      <Sparkles className="h-5 w-5" />
                    </div>
                  )}

                  <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
                        isUser
                          ? 'bg-[#1a56db] text-white rounded-tr-none'
                          : 'bg-stone-50 text-stone-800 border border-stone-200 rounded-tl-none font-sans'
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-sans">
                        {msg.content}
                      </div>
                    </div>

                    {/* Citations/sources */}
                    {!isUser && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 w-full" id={`citations-block-${msg.id}`}>
                        <button
                          onClick={() => toggleCitations(msg.id)}
                          className="flex items-center gap-1.5 text-xs font-medium text-[#1a56db] hover:text-[#154ec1] focus:outline-none cursor-pointer"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          {expandedCitations[msg.id] ? 'Hide' : 'Show'} Retrieved Sources ({msg.sources.length} chunks)
                          {expandedCitations[msg.id] ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>

                        {expandedCitations[msg.id] && (
                          <div className="mt-2.5 space-y-2.5 pl-3.5 border-l-2 border-stone-200" id={`citations-list-${msg.id}`}>
                            {msg.sources.map((source, idx) => (
                              <div
                                key={idx}
                                className="bg-stone-50/50 border border-stone-200 rounded-2xl p-4 flex flex-col gap-2.5 shadow-sm"
                                id={`citation-card-${idx}`}
                              >
                                <div className="flex items-center justify-between gap-2 border-b border-stone-200/60 pb-2">
                                  <span className="text-[11px] font-bold text-stone-700 flex items-center gap-1 truncate pr-16 font-display">
                                    <Quote className="h-3 w-3 text-[#1a56db] shrink-0" />
                                    [Source {idx + 1}] • {source.paperName} • Page {source.pageNumber}
                                  </span>
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border uppercase tracking-wider ${getScoreBadgeColor(
                                      source.score
                                    )}`}
                                  >
                                    Relevance: {(source.score * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <p className="text-xs text-stone-600 italic leading-relaxed">
                                  "{source.text}"
                                </p>
                                <div className="text-[10px] text-stone-400 font-mono mt-0.5 self-end">
                                  Chunk #{source.chunkIndex}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <span className="text-[10px] text-stone-400 mt-1.5 font-mono px-1">
                      {new Date(msg.timestamp).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-4 justify-start" id="chat-loader-msg">
              <div className="h-9 w-9 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                <RefreshCw className="h-5 w-5 text-[#1a56db] animate-spin" />
              </div>
              <div className="flex flex-col items-start max-w-[85%]">
                <div className="bg-stone-50 text-stone-500 border border-stone-200 rounded-2xl rounded-tl-none px-5 py-3.5 text-sm flex flex-col gap-1.5 shadow-sm">
                  <span className="font-semibold text-stone-800">ScholarMind is analyzing...</span>
                  <span className="text-xs text-[#1a56db] font-mono animate-pulse">{loadingStep}</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs" id="chat-error-alert">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-sans">{error}</div>
          </div>
        )}

        {/* Chat input box */}
        <form onSubmit={handleSubmitForm} className="mt-4 pt-4 border-t border-stone-100" id="chat-input-form">
          <div className="relative flex items-center bg-stone-50 border border-stone-300 hover:border-stone-400 rounded-2xl px-5 py-2.5 transition-all focus-within:bg-white focus-within:border-[#1a56db] focus-within:ring-1 focus-within:ring-[#1a56db]">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={papers.length === 0 ? "Upload papers first to enable chat assistant..." : "Ask a question about your papers..."}
              disabled={papers.length === 0 || isLoading}
              className="grow bg-transparent text-stone-800 text-sm placeholder-stone-400 focus:outline-none pr-12 py-1"
            />
            
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                className="absolute right-16 p-2 text-stone-400 hover:text-red-500 rounded-lg hover:bg-stone-100 transition-colors mr-1 cursor-pointer"
                title="Clear chat history"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}

            <button
              type="submit"
              disabled={!input.trim() || isLoading || papers.length === 0}
              className="absolute right-3 bg-[#1a56db] hover:bg-[#154ec1] text-white rounded-xl p-2.5 transition-all shrink-0 flex items-center justify-center hover:shadow-md disabled:opacity-30 disabled:hover:shadow-none cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          
          <div className="text-center text-[10px] text-stone-400 font-mono mt-2 leading-none flex items-center justify-center gap-1">
            <span>Powered by Gemini-3.5-Flash</span>
            <span>•</span>
            <span>Accurate page-wise RAG citation index</span>
          </div>
        </form>
      </div>
    </div>
  );
}
