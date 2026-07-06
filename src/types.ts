/**
 * Shared Type Definitions for ScholarMind
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  picture?: string;
  isGuest: boolean;
}

export interface Paper {
  id: string;
  userId: string;
  name: string;
  size: number;
  uploadDate: string;
  chunkCount: number;
}

export interface Chunk {
  id: string;
  userId: string;
  paperId: string;
  paperName: string;
  text: string;
  index: number;
  embedding: number[];
  /** 1-indexed page number this chunk's text was extracted from. */
  pageNumber: number;
}

export interface SourceCitation {
  paperId: string;
  paperName: string;
  text: string;
  score: number;
  chunkIndex: number;
  /** 1-indexed page number this citation's text was extracted from. */
  pageNumber: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: SourceCitation[];
}

/**
 * Structured content of a full-paper summary, produced by sending the
 * ENTIRE text of a paper to Gemini's large context window (not chunk
 * retrieval). Kept separate from the chunk-based RAG Q&A flow.
 */
export interface PaperSummaryContent {
  researchProblem: string;
  methodology: string;
  keyFindings: string[];
  conclusion: string;
}

export interface PaperSummary extends PaperSummaryContent {
  paperId: string;
  paperName: string;
}

/** One paper's contribution to a multi-paper comparison result. */
export interface ComparisonPaperSources {
  paperId: string;
  paperName: string;
  sources: SourceCitation[];
}

export interface ComparisonResult {
  answer: string;
  sourcesByPaper: ComparisonPaperSources[];
}
