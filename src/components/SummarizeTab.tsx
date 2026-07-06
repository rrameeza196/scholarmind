import React, { useState, useEffect, useRef } from 'react';
import {
  FileSearch,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Target,
  FlaskConical,
  Lightbulb,
  CheckCircle2,
  BookOpen
} from 'lucide-react';
import { Paper, PaperSummary } from '../types.js';
import type { TabId } from '../App.tsx';

interface SummarizeTabProps {
  papers: Paper[];
  initialPaperId: string | null;
  onSwitchTab: (tab: TabId) => void;
}

const LOADING_STEPS = [
  "Reading the full paper into Gemini's large context window...",
  'Identifying the research problem...',
  'Extracting methodology and experimental design...',
  'Synthesizing key findings...',
  'Drafting a structured conclusion...'
];

export default function SummarizeTab({ papers, initialPaperId, onSwitchTab }: SummarizeTabProps) {
  const [selectedPaperId, setSelectedPaperId] = useState<string>(initialPaperId || papers[0]?.id || '');
  const [summary, setSummary] = useState<PaperSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (initialPaperId) {
      setSelectedPaperId(initialPaperId);
      setSummary(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPaperId]);

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
    }, 1400);
  };

  const stopLoadingSteps = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setLoadingStep('');
  };

  const handleGenerateSummary = async () => {
    if (!selectedPaperId || isLoading) return;

    setError(null);
    setSummary(null);
    setIsLoading(true);
    startLoadingSteps();

    try {
      const response = await fetch(`/api/papers/${selectedPaperId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to summarize this paper.');
      }

      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message || 'An error occurred while summarizing the paper.');
    } finally {
      stopLoadingSteps();
      setIsLoading(false);
    }
  };

  const selectedPaper = papers.find(p => p.id === selectedPaperId);

  return (
    <div className="space-y-6" id="summarize-tab-container">
      {/* Header + paper selector */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-2xl font-display font-bold text-stone-900">Summarize Paper</h2>
          <div className="flex items-center gap-1.5 text-xs text-stone-600 font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>Full-context Gemini call</span>
          </div>
        </div>
        <p className="text-xs text-stone-500 mb-5">
          Sends the entire text of one paper directly to Gemini — no chunk retrieval — for a holistic, structured summary.
        </p>

        {papers.length === 0 ? (
          <div className="border border-dashed border-stone-200 bg-stone-50/40 rounded-2xl p-8 text-center">
            <p className="text-sm font-semibold text-stone-700">No papers in your library yet</p>
            <p className="text-xs text-stone-400 mt-1 mb-4">Upload a research PDF to generate a full-paper summary.</p>
            <button
              onClick={() => onSwitchTab('library')}
              className="bg-[#1a56db] hover:bg-[#154ec1] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Go to Library
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedPaperId}
              onChange={(e) => { setSelectedPaperId(e.target.value); setSummary(null); setError(null); }}
              disabled={isLoading}
              className="grow bg-stone-50 border border-stone-300 hover:border-stone-400 rounded-xl px-4 py-2.5 text-sm text-stone-800 focus:bg-white focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db] focus:outline-none transition-all disabled:opacity-60"
            >
              {papers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={handleGenerateSummary}
              disabled={isLoading || !selectedPaperId}
              className="bg-[#1a56db] hover:bg-[#154ec1] text-white px-5 py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-100 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <FileSearch className="h-4 w-4" />
              )}
              {isLoading ? 'Summarizing...' : 'Generate Summary'}
            </button>
          </div>
        )}
      </div>

      {/* Error notification */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs" id="summarize-error-alert">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="leading-relaxed font-sans">{error}</div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="bg-white border border-stone-200 rounded-3xl p-10 shadow-sm flex flex-col items-center text-center" id="summarize-loading-state">
          <div className="h-14 w-14 bg-[#e9effd] rounded-2xl flex items-center justify-center text-[#1a56db] mb-4 shadow-inner">
            <RefreshCw className="h-7 w-7 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-stone-800">ScholarMind is reading the full paper...</p>
          <p className="text-xs text-[#1a56db] font-mono animate-pulse mt-2">{loadingStep}</p>
        </div>
      )}

      {/* Structured summary card — distinct from the chat flow */}
      {!isLoading && summary && (
        <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden" id="paper-summary-card">
          <div className="bg-[#1a56db] px-6 py-5 text-white flex items-center gap-3">
            <div className="h-9 w-9 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-mono text-blue-100">Full-paper summary</p>
              <h3 className="text-sm font-display font-bold truncate">{summary.paperName}</h3>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Research Problem */}
            <div className="flex gap-3">
              <div className="h-8 w-8 bg-orange-50 rounded-xl text-orange-600 border border-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                <Target className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider font-mono mb-1">Research Problem</h4>
                <p className="text-sm text-stone-700 leading-relaxed">{summary.researchProblem}</p>
              </div>
            </div>

            {/* Methodology */}
            <div className="flex gap-3">
              <div className="h-8 w-8 bg-blue-50 rounded-xl text-blue-600 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <FlaskConical className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider font-mono mb-1">Methodology</h4>
                <p className="text-sm text-stone-700 leading-relaxed">{summary.methodology}</p>
              </div>
            </div>

            {/* Key Findings */}
            <div className="flex gap-3">
              <div className="h-8 w-8 bg-emerald-50 rounded-xl text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                <Lightbulb className="h-4 w-4" />
              </div>
              <div className="min-w-0 grow">
                <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider font-mono mb-1.5">Key Findings</h4>
                {summary.keyFindings.length > 0 ? (
                  <ul className="space-y-1.5">
                    {summary.keyFindings.map((finding, idx) => (
                      <li key={idx} className="text-sm text-stone-700 leading-relaxed flex gap-2">
                        <span className="text-emerald-500 font-bold shrink-0">•</span>
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-stone-400 italic">No distinct findings were extracted.</p>
                )}
              </div>
            </div>

            {/* Conclusion */}
            <div className="flex gap-3 pt-2 border-t border-stone-100">
              <div className="h-8 w-8 bg-stone-100 rounded-xl text-stone-600 border border-stone-200 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider font-mono mb-1">Conclusion</h4>
                <p className="text-sm text-stone-700 leading-relaxed">{summary.conclusion}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-3 border-t border-stone-100 bg-stone-50/50 text-[10px] text-stone-400 font-mono flex items-center gap-1.5">
            <BookOpen className="h-3 w-3" />
            Generated from the full document text via Gemini's large context window — not chunk retrieval.
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !summary && !error && papers.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-3xl p-14 shadow-sm flex flex-col items-center text-center" id="summarize-empty-state">
          <div className="h-14 w-14 bg-[#e9effd] rounded-2xl flex items-center justify-center text-[#1a56db] mb-4 shadow-inner">
            <FileSearch className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-display font-bold text-stone-900">Select a paper and generate a summary</h3>
          <p className="text-xs text-stone-500 max-w-sm mt-2 leading-relaxed">
            {selectedPaper ? `Ready to summarize "${selectedPaper.name}".` : 'Choose a paper above to get started.'}
          </p>
        </div>
      )}
    </div>
  );
}
