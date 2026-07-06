import { GoogleGenAI } from "@google/genai";
import { Chunk, SourceCitation, PaperSummaryContent } from '../src/types.js';

/** Model used for grounded Q&A, full-context summarization, and comparison. */
const GENERATION_MODEL = 'gemini-3.5-flash';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please add it in the Secrets panel in AI Studio Settings.");
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}

/**
 * Split text into chunks of ~chunkSize words with an overlap of overlap words.
 */
export function chunkText(text: string, chunkSize = 400, overlap = 50): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || text.trim() === '') return [];
  if (words.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    if (chunkWords.length > 0) {
      chunks.push(chunkWords.join(' '));
    }
    // Advance index by chunk size minus overlap
    i += chunkSize - overlap;
    
    // Safety check to prevent infinite loop
    if (chunkSize <= overlap) {
      i += chunkSize;
    }
  }
  return chunks;
}

/**
 * Calculates the cosine similarity between two numerical vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generates an embedding vector for a given text.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const client = getGeminiClient();
  try {
    const response: any = await client.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: text,
    });

    // Different versions of the @google/genai SDK have returned this in
    // slightly different shapes: some return a singular `embedding` object,
    // current versions return a plural `embeddings` array (since the
    // underlying API supports batching multiple contents in one call).
    // Handle both so this doesn't break again on a future SDK bump.
    const values = response.embedding?.values || response.embeddings?.[0]?.values;

    if (values) {
      return values;
    }
    console.error('Unexpected embedContent response shape:', JSON.stringify(response));
    throw new Error(`Embedding values not found in response (received keys: ${Object.keys(response || {}).join(', ') || 'none'})`);
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Run semantic search on stored chunks and answer the question using gemini-3.5-flash.
 */
export async function queryRAG(
  question: string,
  chunks: Chunk[],
  filterPaperId?: string
): Promise<{ answer: string; sources: SourceCitation[]; lowConfidence: boolean }> {
  if (chunks.length === 0) {
    return {
      answer: "No research papers have been uploaded yet. Please upload research papers first in the Upload section.",
      sources: [],
      lowConfidence: true,
    };
  }

  // 1. Generate embedding for the question
  const questionEmbedding = await getEmbedding(question);

  // 2. Filter chunks if paper filter is active
  const candidateChunks = filterPaperId
    ? chunks.filter(c => filterPaperId.split(',').includes(c.paperId))
    : chunks;

  if (candidateChunks.length === 0) {
    return {
      answer: "No relevant content found in the selected research paper.",
      sources: [],
      lowConfidence: true,
    };
  }

  // 3. Compute cosine similarity for each chunk
  const scoredChunks = candidateChunks.map(chunk => {
    const score = cosineSimilarity(questionEmbedding, chunk.embedding);
    return { chunk, score };
  });

  // 4. Sort and take top 5 chunks
  scoredChunks.sort((a, b) => b.score - a.score);
  const topResults = scoredChunks.slice(0, 5);

  // Determine confidence threshold (user specified 0.3)
  const highestScore = topResults.length > 0 ? topResults[0].score : 0;
  const lowConfidence = highestScore < 0.3;

  if (lowConfidence) {
    return {
      answer: `I could not find a sufficiently high-confidence answer in your uploaded papers for this question (highest similarity score was ${highestScore.toFixed(2)}, which is below the 0.3 threshold). 

Please try rephrasing your question or ensure you have uploaded papers covering this topic.`,
      sources: topResults.map(r => ({
        paperId: r.chunk.paperId,
        paperName: r.chunk.paperName,
        text: r.chunk.text,
        score: r.score,
        chunkIndex: r.chunk.index,
        pageNumber: r.chunk.pageNumber,
      })),
      lowConfidence: true,
    };
  }

  // 5. Build prompt with grounded context
  const contextParts = topResults.map((r, idx) => {
    return `[Source ${idx + 1}] - Paper: "${r.chunk.paperName}" (Page ${r.chunk.pageNumber}, Chunk #${r.chunk.index}):\n${r.chunk.text}`;
  });
  const context = contextParts.join('\n\n');

  const systemInstruction = `You are ScholarMind, an intelligent academic research assistant for Final Year Projects (FYP).
You are given relevant text chunks from the user's research papers as context, and a student's question.

Your absolute highest-priority directive is to answer the question using ONLY the provided context chunks.

CRITICAL INSTRUCTIONS:
1. Ground your answer strictly in the provided sources. Do not make up facts or use external training data.
2. For every claim you make that is derived from the context, you MUST cite the source using the format [Source X] where X is the source number (e.g., [Source 1], [Source 2]).
3. If the provided context does not contain sufficient information to answer the question, say so clearly (e.g. "The provided research papers do not contain details regarding X."). Do not try to hypothesize or synthesize from outside knowledge.
4. Keep your answer highly professional, concise, academic, and structured. Use formatting like bullet points where appropriate to make information readable.`;

  const prompt = `Student Question: "${question}"

Provided Context from Research Papers:
${context}

ScholarMind Answer with Citations:`;

  // 6. Generate grounded response
  const client = getGeminiClient();
  try {
    const response = await client.models.generateContent({
      model: GENERATION_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2, // Low temperature for factual grounding
      },
    });

    const sources: SourceCitation[] = topResults.map(r => ({
      paperId: r.chunk.paperId,
      paperName: r.chunk.paperName,
      text: r.chunk.text,
      score: r.score,
      chunkIndex: r.chunk.index,
      pageNumber: r.chunk.pageNumber,
    }));

    return {
      answer: response.text || "No response generated.",
      sources,
      lowConfidence: false,
    };
  } catch (error) {
    console.error('Error generating grounded completion:', error);
    throw error;
  }
}

const MAX_SUMMARY_CHARS = 600000;

export async function summarizePaper(paperName: string, fullText: string): Promise<PaperSummaryContent> {
  const client = getGeminiClient();

  const truncated = fullText.length > MAX_SUMMARY_CHARS;
  const textForModel = truncated ? fullText.slice(0, MAX_SUMMARY_CHARS) : fullText;

  const systemInstruction = `You are ScholarMind, an academic research assistant for Final Year Project (FYP) students.
You are given the FULL TEXT of a single research paper (not a chunked excerpt).
Read it in its entirety and produce a precise, well-structured, academic summary.
Do not invent information that isn't supported by the paper. If a section genuinely cannot be determined from the text, say so briefly rather than guessing.`;

  const prompt = `Full text of the paper "${paperName}":

"""
${textForModel}${truncated ? '\n\n[Note: the paper was truncated for length before reaching the model.]' : ''}
"""

Summarize this paper for the four fields in the response schema: the research problem it addresses, the methodology used, the key findings, and the conclusion.`;

  try {
    const response: any = await client.models.generateContent({
      model: GENERATION_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            researchProblem: { type: 'STRING', description: 'The research problem or question the paper addresses.' },
            methodology: { type: 'STRING', description: 'The methodology, approach, or experimental design used.' },
            keyFindings: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'The key findings or results, as a list of concise bullet points.',
            },
            conclusion: { type: 'STRING', description: "The paper's conclusion and its broader implications." },
          },
          required: ['researchProblem', 'methodology', 'keyFindings', 'conclusion'],
        },
      } as any,
    });

    const raw = response.text || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { researchProblem: raw, methodology: '', keyFindings: [], conclusion: '' };
    }

    return {
      researchProblem: parsed.researchProblem || 'Not clearly stated in the paper.',
      methodology: parsed.methodology || 'Not clearly stated in the paper.',
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
      conclusion: parsed.conclusion || 'Not clearly stated in the paper.',
    };
  } catch (error) {
    console.error('Error generating full-paper summary:', error);
    throw error;
  }
}

export async function compareAcrossPapers(
  question: string,
  chunks: Chunk[],
  paperIds: string[],
  paperNames: Record<string, string>
): Promise<{ answer: string; sourcesByPaper: { paperId: string; paperName: string; sources: SourceCitation[] }[] }> {
  if (paperIds.length < 2) {
    throw new Error('Select at least two papers to compare.');
  }

  const questionEmbedding = await getEmbedding(question);

  const sourcesByPaper: { paperId: string; paperName: string; sources: SourceCitation[] }[] = [];
  const contextSections: string[] = [];
  const CHUNKS_PER_PAPER = 4;

  for (const paperId of paperIds) {
    const paperChunks = chunks.filter(c => c.paperId === paperId);
    const paperName = paperNames[paperId] || paperChunks[0]?.paperName || paperId;

    if (paperChunks.length === 0) {
      sourcesByPaper.push({ paperId, paperName, sources: [] });
      contextSections.push(`--- Paper: "${paperName}" ---\n(No indexed content is available for this paper.)`);
      continue;
    }

    const scored = paperChunks
      .map(chunk => ({ chunk, score: cosineSimilarity(questionEmbedding, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, CHUNKS_PER_PAPER);

    const sources: SourceCitation[] = scored.map(r => ({
      paperId: r.chunk.paperId,
      paperName: r.chunk.paperName,
      text: r.chunk.text,
      score: r.score,
      chunkIndex: r.chunk.index,
      pageNumber: r.chunk.pageNumber,
    }));
    sourcesByPaper.push({ paperId, paperName, sources });

    const sectionText = scored
      .map((r, idx) => `[Excerpt ${idx + 1}, Page ${r.chunk.pageNumber}]:\n${r.chunk.text}`)
      .join('\n\n');
    contextSections.push(`--- Paper: "${paperName}" ---\n${sectionText}`);
  }

  const fullContext = contextSections.join('\n\n');

  const systemInstruction = `You are ScholarMind, an academic research assistant helping a Final Year Project (FYP) student compare multiple research papers.

You are given excerpts from ${paperIds.length} different papers, clearly separated by paper name, and a comparison question.

CRITICAL INSTRUCTIONS:
1. Directly compare and contrast the papers in relation to the question.
2. Every point you make MUST be clearly attributed to the paper it came from by name (e.g. "In 'Attention Is All You Need', the authors use X, whereas 'BERT' instead uses Y").
3. Ground your answer strictly in the provided excerpts. Do not use outside knowledge. If an excerpt doesn't address the question for a given paper, say so rather than guessing.
4. Structure your answer clearly — for example a short labeled section per paper, followed by a brief synthesis of the key similarities and differences.
5. Keep the tone professional, concise, and academic. Use bullet points where helpful.`;

  const prompt = `Comparison Question: "${question}"

Paper Excerpts:
${fullContext}

ScholarMind Comparative Analysis:`;

  const client = getGeminiClient();
  try {
    const response = await client.models.generateContent({
      model: GENERATION_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    return {
      answer: response.text || 'No response generated.',
      sourcesByPaper,
    };
  } catch (error) {
    console.error('Error generating cross-paper comparison:', error);
    throw error;
  }
}
