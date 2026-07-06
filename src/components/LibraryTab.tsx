import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Loader2, Link, Trash2, ArrowRight, FileSearch } from 'lucide-react';
import { Paper } from '../types.js';

interface LibraryTabProps {
  papers: Paper[];
  onUploadSuccess: (paper: Paper) => void;
  onDeleteSuccess: (paperId: string) => void;
  onSelectPaperForChat: (paperId: string) => void;
  onSelectPaperForSummary: (paperId: string) => void;
}

export default function LibraryTab({
  papers,
  onUploadSuccess,
  onDeleteSuccess,
  onSelectPaperForChat,
  onSelectPaperForSummary
}: LibraryTabProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Link Paste State
  const [linkInput, setLinkInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const simulateProgress = () => {
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 250);
    return interval;
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Only PDF research papers are supported. Other formats cannot be parsed.');
      setSuccess(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size allowed in RAG pipeline is 10MB.');
      setSuccess(null);
      return;
    }

    setError(null);
    setSuccess(null);
    setIsUploading(true);
    setUploadProgress(5);

    const progressInterval = simulateProgress();

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/papers/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse and index PDF.');
      }

      setUploadProgress(100);
      setSuccess(`"${file.name}" indexed successfully with ${data.paper.chunkCount} vectors.`);
      
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        onUploadSuccess(data.paper);
      }, 1000);

    } catch (err: any) {
      clearInterval(progressInterval);
      setError(err.message || 'Error occurred while indexing document.');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkInput.trim() || isLinking) return;

    const url = linkInput.trim();
    setIsLinking(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(15);

    const progressInterval = simulateProgress();

    try {
      const response = await fetch('/api/papers/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to download and parse URL.');
      }

      setUploadProgress(100);
      setSuccess(`Indexed "${data.paper.name}" successfully from URL with ${data.paper.chunkCount} vector chunks.`);
      setLinkInput('');

      setTimeout(() => {
        setIsLinking(false);
        setUploadProgress(0);
        onUploadSuccess(data.paper);
      }, 1000);

    } catch (err: any) {
      clearInterval(progressInterval);
      setError(err.message || 'Could not fetch or parse the given document link.');
      setIsLinking(false);
      setUploadProgress(0);
    }
  };

  const handleDeletePaper = async (paperId: string, name: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete "${name}"? This removes the document and all associated embedding vector indices.`);
    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/papers/${paperId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete paper');
      }

      onDeleteSuccess(paperId);
    } catch (error) {
      console.error('Error deleting paper:', error);
      alert('Could not delete paper. Please try again.');
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getYearPlaceholder = (paperName: string) => {
    if (paperName.toLowerCase().includes('attention')) return 'Vaswani et al. · 2017';
    if (paperName.toLowerCase().includes('bert')) return 'Devlin et al. · 2019';
    if (paperName.toLowerCase().includes('lora')) return 'Hu et al. · 2021';
    if (paperName.toLowerCase().includes('rag')) return 'Lewis et al. · 2020';
    if (paperName.toLowerCase().includes('gpt')) return 'Radford et al. · 2020';
    return 'ScholarMind PDF Parser · 2026';
  };

  return (
    <div className="space-y-6" id="library-tab-container">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-stone-900">Library</h2>
          <p className="text-xs text-stone-500 mt-1">
            {papers.length} sources · ScholarMind can answer questions from all of them
          </p>
        </div>
        <button
          onClick={triggerFileInput}
          className="bg-[#1a56db] hover:bg-[#154ec1] text-white px-5 py-2.5 rounded-xl font-medium text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-100"
        >
          + Upload paper
        </button>
      </div>

      {/* Upload and Paste Links Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left side: Upload card */}
        <div className="lg:col-span-7 bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col h-full">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={isUploading || isLinking ? undefined : triggerFileInput}
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer grow transition-all duration-200 ${
              isDragging
                ? 'border-[#1a56db] bg-[#e9effd]/40 scale-[1.01]'
                : 'border-blue-200 bg-[#e9effd]/20 hover:border-[#1a56db]/50 hover:bg-[#e9effd]/30'
            } ${isUploading || isLinking ? 'pointer-events-none opacity-50' : ''}`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,application/pdf"
              className="hidden"
              disabled={isUploading || isLinking}
            />

            {isUploading ? (
              <div className="flex flex-col items-center py-2 w-full">
                <Loader2 className="h-10 w-10 text-[#1a56db] animate-spin mb-4" />
                <span className="text-sm font-semibold text-stone-800">
                  ScholarMind is extracting and indexing vectors...
                </span>
                <span className="text-xs text-stone-500 mt-1 mb-4 font-mono">
                  Tokenizing PDF → Semantic overlap chunking → Embedding via Gemini
                </span>
                <div className="w-full max-w-xs bg-stone-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#1a56db] h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <span className="text-xs text-[#1a56db] font-semibold font-mono mt-1.5">{uploadProgress}% Complete</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="p-4 bg-white rounded-full border border-stone-200 mb-4 text-[#1a56db] shadow-sm">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <p className="text-sm font-semibold text-stone-800">
                  Drag & drop PDFs, or <span className="text-[#1a56db] underline">click to browse</span>
                </p>
                <p className="text-xs text-stone-400 mt-2">
                  Up to 40MB, indexed for citation-backed answers.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right side: Paste Link Card */}
        <div className="lg:col-span-5 bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between h-full min-h-[190px]">
          <div>
            <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2 font-display">
              <Link className="h-4 w-4 text-[#1a56db]" />
              Or paste a link
            </h3>
            <p className="text-xs text-stone-400 mt-1 leading-relaxed">
              Accepts public research PDFs or ArXiv abstract URLs (e.g. arxiv.org/abs/1706.03762). We'll scrape, download, and index the text into your workspace instantly.
            </p>
          </div>

          <form onSubmit={handleAddLink} className="mt-4 space-y-3">
            <div className="relative">
              <input
                type="text"
                required
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="https://arxiv.org/abs/..."
                disabled={isUploading || isLinking}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-xs text-stone-800 placeholder-stone-400 focus:bg-white focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db] focus:outline-none transition-all disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!linkInput.trim() || isUploading || isLinking}
              className="w-full bg-[#1a56db] hover:bg-[#154ec1] text-white py-2.5 rounded-xl font-medium text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isLinking ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Scraping Link...
                </>
              ) : (
                'Add Paper'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs" id="lib-error-alert">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="leading-relaxed font-sans">{error}</div>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-700 text-xs" id="lib-success-alert">
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="leading-relaxed font-sans">{success}</div>
        </div>
      )}

      {/* Uploaded Papers Grid / Table */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm" id="library-list-card">
        <h3 className="text-sm font-bold text-stone-800 mb-4 uppercase tracking-wider font-mono">
          All library items
        </h3>

        {papers.length === 0 ? (
          <div className="border border-stone-200 border-dashed bg-stone-50/40 rounded-2xl p-12 text-center flex flex-col items-center">
            <FileText className="h-10 w-10 text-stone-300 mb-3" />
            <p className="text-sm font-semibold text-stone-700">Your library is currently empty</p>
            <p className="text-xs text-stone-400 max-w-xs mt-1 leading-relaxed">
              Upload PDF research documents or paste abstract links above. ScholarMind will index them for citation-grounded RAG query answers.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5" id="library-papers-rows">
            {papers.map((paper) => (
              <div
                key={paper.id}
                id={`lib-row-${paper.id}`}
                className="group border border-stone-150 bg-white hover:border-stone-300 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:shadow-sm"
              >
                {/* Left side info */}
                <div className="flex items-start gap-3.5 grow min-w-0">
                  <div className="p-3 bg-amber-50 rounded-xl text-amber-600 border border-amber-100 flex items-center justify-center shrink-0 shadow-sm">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-stone-800 group-hover:text-[#1a56db] transition-colors truncate pr-6">
                      {paper.name}
                    </h4>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {getYearPlaceholder(paper.name)} • {paper.chunkCount} vectors • {formatSize(paper.size)}
                    </p>
                  </div>
                </div>

                {/* Right side actions */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-150 text-[#137333] text-[10px] font-bold uppercase tracking-wider rounded-full">
                    Indexed
                  </span>
                  
                  <button
                    onClick={() => onSelectPaperForSummary(paper.id)}
                    className="bg-stone-50 hover:bg-[#e9effd] hover:text-[#1a56db] text-stone-600 border border-stone-200 hover:border-blue-200 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <FileSearch className="h-3 w-3" />
                    Summarize
                  </button>

                  <button
                    onClick={() => onSelectPaperForChat(paper.id)}
                    className="bg-stone-50 hover:bg-[#e9effd] hover:text-[#1a56db] text-stone-600 border border-stone-200 hover:border-blue-200 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    Ask about this
                    <ArrowRight className="h-3 w-3" />
                  </button>

                  <button
                    onClick={() => handleDeletePaper(paper.id, paper.name)}
                    className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100 cursor-pointer"
                    title="Delete document and chunks"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
