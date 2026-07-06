import React, { useState, useRef, useEffect } from 'react';
import {
  Columns3,
  Send,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Plus,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Quote
} from 'lucide-react';
import { Paper, ComparisonResult } from '../types.js';
import type { TabId } from '../App.tsx';

interface ComparePapersTabProps {
  papers: Paper[];
  onSwitchTab: (tab: TabId) => void;
}

const LOADING_STEPS = [
  'Embedding the comparison question...',
  'Retrieving top matches from each selected paper...',
  'Cross-referencing methodologies and results...',
  'Attributing each point to its source paper...',
  'Synthesizing the comparative analysis...'
];

const SUGGESTIONS = [
  'How do these papers differ in methodology?',
  'Which paper reports stronger results, and why?',
  'What common limitations do these papers share?'
];

export default function ComparePapersTab({ papers, onSwitchTab }: ComparePapersTabProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedPaperId, setExpandedPaperId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startLoadingSteps = () => {
    let idx = 0;
    setLoadingStep(LOADING_STEPS[0]);
    intervalRef.current = setInterval(() => {
      idx = (idx + 1) % LOADING_STEPS.length;
      setLoadingStep(LOADING_STEPS[idx]);
    }, 1300);
  };

  const stopLoadingSteps = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setLoadingStep('');
  };

  const toggleSelection = (paperId: string) => {
    setSelectedIds(prev =>
      prev.includes(paperId) ? prev.filter(id => id !== paperId) : [...prev, paperId]
    );
  };

  const runComparison = async (q: string) => {
    if (!q.trim() || isLoading) return;
    if (selectedIds.length < 2) {
      setError('Select at least two papers to compare.');
      return;
    }

    setError(null);
    setResult(null);
    setIsLoading(true);
    startLoadingSteps();

    try {
      const response = await fetch('/api/papers/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, paperIds: selectedIds })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to compare the selected papers.');
      }

      setResult({ answer: data.answer, sourcesByPaper: data.sourcesByPaper });
    } catch (err: any) {
      setError(err.message || 'An error occurred while comparing papers.');
    } finally {
      stopLoadingSteps();
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runComparison(question);
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 0.7) return 'bg-[#e6f4ea] text-[#137333] border-[#ceead6]';
    if (score >= 0.5) return 'bg-[#fef7e0] text-[#b06000] border-[#feebc8]';
    return 'bg-stone-100 text-stone-600 border-stone-200';
  };

  if (papers.length < 2) {
    return (
      <div className="space-y-6" id="compare-tab-container">
        <div className="bg-white border border-stone-200 rounded-3xl p-14 shadow-sm flex flex-col items-center text-center">
          <div className="h-14 w-14 bg-[#e9effd] rounded-2xl flex items-center justify-center text-[#1a56db] mb-4 shadow-inner">
            <Columns3 className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-display font-bold text-stone-900">Need at least two papers to compare</h3>
          <p className="text-xs text-stone-500 max-w-sm mt-2 leading-relaxed">
            Upload another research paper to unlock multi-paper comparison mode.
          </p>
          <button
            onClick={() => onSwitchTab('library')}
            className="mt-5 bg-[#1a56db] hover:bg-[#154ec1] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            Go to Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="compare-tab-container">
      {/* Selector + question form */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-2xl font-display font-bold text-stone-900">Compare Papers</h2>
          <div className="flex items-center gap-1.5 text-xs text-stone-600 font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>{selectedIds.length} selected</span>
          </div>
        </div>
        <p className="text-xs text-stone-500 mb-4">
          Select 2 or more papers, then ask a comparison question. Every point in the answer is attributed to the paper it came from.
        </p>

        {/* Paper multi-select pills */}
        <div className="flex flex-wrap items-center gap-2 mb-5" id="compare-pills-list">
          {papers.map(paper => {
            const isChecked = selectedIds.includes(paper.id);
            return (
              <button
                key={paper.id}
                onClick={() => toggleSelection(paper.id)}
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
          })}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="relative flex items-center bg-stone-50 border border-stone-300 hover:border-stone-400 rounded-2xl px-5 py-2.5 transition-all focus-within:bg-white focus-within:border-[#1a56db] focus-within:ring-1 focus-within:ring-[#1a56db]">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={selectedIds.length < 2 ? 'Select at least 2 papers above first...' : 'e.g. How do these papers differ in methodology?'}
              disabled={selectedIds.length < 2 || isLoading}
              className="grow bg-transparent text-stone-800 text-sm placeholder-stone-400 focus:outline-none pr-12 py-1"
            />
            <button
              type="submit"
              disabled={!question.trim() || selectedIds.length < 2 || isLoading}
              className="absolute right-3 bg-[#1a56db] hover:bg-[#154ec1] text-white rounded-xl p-2.5 transition-all shrink-0 flex items-center justify-center hover:shadow-md disabled:opacity-30 disabled:hover:shadow-none cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>

        {selectedIds.length >= 2 && !result && !isLoading && (
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => { setQuestion(s); runComparison(s); }}
                className="px-3.5 py-1.5 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-medium rounded-full border border-stone-200 transition-all cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error notification */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs" id="compare-error-alert">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="leading-relaxed font-sans">{error}</div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="bg-white border border-stone-200 rounded-3xl p-10 shadow-sm flex flex-col items-center text-center" id="compare-loading-state">
          <div className="h-14 w-14 bg-[#e9effd] rounded-2xl flex items-center justify-center text-[#1a56db] mb-4 shadow-inner">
            <RefreshCw className="h-7 w-7 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-stone-800">ScholarMind is comparing your papers...</p>
          <p className="text-xs text-[#1a56db] font-mono animate-pulse mt-2">{loadingStep}</p>
        </div>
      )}

      {/* Comparative analysis result */}
      {!isLoading && result && (
        <div className="space-y-6" id="compare-result-block">
          {/* Answer card */}
          <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="bg-[#1a56db] px-6 py-4 text-white flex items-center gap-3">
              <div className="h-8 w-8 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
                <Sparkles className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-mono text-blue-100">Comparative analysis</p>
                <h3 className="text-sm font-display font-bold">"{question}"</h3>
              </div>
            </div>
            <div className="p-6">
              <div className="whitespace-pre-wrap text-sm text-stone-800 leading-relaxed font-sans">
                {result.answer}
              </div>
            </div>
          </div>

          {/* Side-by-side sources per paper */}
          <div>
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider font-mono mb-3 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-[#1a56db]" />
              Sources by paper
            </h3>
            <div className={`grid grid-cols-1 ${result.sourcesByPaper.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'} gap-4`}>
              {result.sourcesByPaper.map(group => {
                const isExpanded = expandedPaperId === group.paperId;
                return (
                  <div key={group.paperId} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex flex-col">
                    <button
                      onClick={() => setExpandedPaperId(isExpanded ? null : group.paperId)}
                      className="flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <h4 className="text-xs font-bold text-stone-800 truncate text-left font-display">{group.paperName}</h4>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                      )}
                    </button>
                    <p className="text-[10px] text-stone-400 font-mono mt-0.5 mb-3">
                      {group.sources.length} excerpt{group.sources.length !== 1 ? 's' : ''} retrieved
                    </p>

                    {isExpanded && (
                      <div className="space-y-2.5">
                        {group.sources.length === 0 ? (
                          <p className="text-xs text-stone-400 italic">No indexed content found for this paper.</p>
                        ) : (
                          group.sources.map((source, idx) => (
                            <div key={idx} className="bg-stone-50/50 border border-stone-200 rounded-xl p-3 flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold text-stone-600 flex items-center gap-1">
                                  <Quote className="h-3 w-3 text-[#1a56db] shrink-0" />
                                  Page {source.pageNumber}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold border uppercase tracking-wider ${getScoreBadgeColor(source.score)}`}>
                                  {(source.score * 100).toFixed(0)}%
                                </span>
                              </div>
                              <p className="text-[11px] text-stone-600 italic leading-relaxed">"{source.text}"</p>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !result && !error && (
        <div className="bg-white border border-stone-200 rounded-3xl p-14 shadow-sm flex flex-col items-center text-center" id="compare-empty-state">
          <div className="h-14 w-14 bg-[#e9effd] rounded-2xl flex items-center justify-center text-[#1a56db] mb-4 shadow-inner">
            <Plus className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-display font-bold text-stone-900">
            {selectedIds.length < 2 ? 'Select 2 or more papers to begin' : 'Ask a comparison question'}
          </h3>
          <p className="text-xs text-stone-500 max-w-md mt-2 leading-relaxed">
            ScholarMind will retrieve the most relevant excerpts from each paper and clearly attribute every point in its answer.
          </p>
        </div>
      )}
    </div>
  );
}
