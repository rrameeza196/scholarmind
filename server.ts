import dotenv from 'dotenv';
import path from 'path';

// Load .env first (if present), then .env.local on top of it so a
// .env.local value always wins — matching the Vite/AI-Studio convention
// this project's .env.example was written for.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { setGlobalDispatcher, Agent } from 'undici';
setGlobalDispatcher(new Agent({ allowH2: false }));

import express from 'express';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';

import {
  getPapers,
  addPaper,
  deletePaper,
  getChunks,
  addChunks,
  getChatHistory,
  addChatMessage,
  clearChatHistory,
  getPaperText,
  setPaperText
} from './server/dbStore.js';

import {
  chunkText,
  getEmbedding,
  queryRAG,
  summarizePaper,
  compareAcrossPapers
} from './server/ragEngine.js';

import { extractPdfPages } from './server/pdfUtils.js';

import {
  requireAuth,
  signInWithGoogle,
  createGuestSession,
  logout,
  setSessionCookie,
  clearSessionCookie,
  resolveUserFromRequest,
  SESSION_COOKIE_NAME
} from './server/auth.js';

import { Paper, Chunk, ChatMessage } from './src/types.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Increase body size limit for larger requests
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // --- AUTH ROUTES (no auth required to hit these) ---

  // Sign in with a Google ID token obtained from the Google Identity
  // Services "Sign in with Google" button on the frontend.
  app.post('/api/auth/google', async (req, res) => {
    try {
      const { credential } = req.body;
      if (!credential) {
        return res.status(400).json({ error: 'Missing Google credential.' });
      }
      const { user, sessionToken } = await signInWithGoogle(credential);
      setSessionCookie(res, sessionToken);
      res.json({ user });
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
    }
  });

  // Start an anonymous guest session — isolated the same way real accounts
  // are, just not tied to a persistent identity.
  app.post('/api/auth/guest', async (req, res) => {
    try {
      const { user, sessionToken } = await createGuestSession();
      setSessionCookie(res, sessionToken);
      res.json({ user });
    } catch (error: any) {
      console.error('Error creating guest session:', error);
      res.status(500).json({ error: 'Failed to start a guest session.' });
    }
  });

  // Check whether the current cookie maps to a valid session.
  app.get('/api/auth/me', async (req, res) => {
    try {
      const user = await resolveUserFromRequest(req);
      if (!user) {
        return res.status(401).json({ error: 'Not signed in.' });
      }
      res.json({ user });
    } catch (error: any) {
      console.error('Error checking session:', error);
      res.status(401).json({ error: 'Not signed in.' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const token = req.cookies?.[SESSION_COOKIE_NAME];
      await logout(token);
      clearSessionCookie(res);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error logging out:', error);
      res.status(500).json({ error: 'Failed to log out.' });
    }
  });

  // --- API ROUTES (all require a signed-in session, Google or guest) ---
  const api = express.Router();
  api.use(requireAuth);

  // 1. Get all papers for the current user
  api.get('/papers', async (req, res) => {
    try {
      const papers = await getPapers(req.user!.id);
      res.json(papers);
    } catch (error: any) {
      console.error('Error fetching papers:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch papers.' });
    }
  });

  // 2. Upload and process paper (extract, chunk, embed, store)
  api.post('/papers/upload', upload.single('file'), async (req, res) => {
    try {
      const userId = req.user!.id;
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }
      const filename = req.file.originalname;
      const size = req.file.size;

      // Ensure it's a PDF
      if (!filename.toLowerCase().endsWith('.pdf') && req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'Only PDF documents are supported currently.' });
      }

      // Check for duplicate uploads (scoped to this user)
      const existingPapers = await getPapers(userId);
      if (existingPapers.some(p => p.name === filename)) {
        return res.status(400).json({ error: `A research paper named "${filename}" has already been uploaded.` });
      }

      // Extract text from PDF buffer, tracking page boundaries as we go
      let extraction;
      try {
        extraction = await extractPdfPages(req.file.buffer);
      } catch (pdfError: any) {
        console.error('PDF parsing error:', pdfError);
        return res.status(400).json({ error: 'Failed to extract text from the PDF. The file may be corrupted, encrypted, or not a valid PDF.' });
      }

      const { pages, fullText } = extraction;
      if (!fullText.trim()) {
        return res.status(400).json({ error: 'Extracted text is empty. This PDF might contain scanned images without OCR text.' });
      }

      // Chunk text per-page (~400 words with 50-word overlap) so every chunk
      // can be tagged with the page number it came from.
      const pageAwareChunks: { text: string; pageNumber: number }[] = [];
      for (const page of pages) {
        const pageChunks = chunkText(page.text, 400, 50);
        for (const c of pageChunks) {
          pageAwareChunks.push({ text: c, pageNumber: page.pageNumber });
        }
      }
      if (pageAwareChunks.length === 0) {
        return res.status(400).json({ error: 'Extracted text was too short to create semantic chunks.' });
      }

      const paperId = 'paper_' + Date.now().toString();
      const paperName = filename;

      // Generate embedding vectors in small, safe concurrent batches of 5
      const chunks: Chunk[] = [];
      const batchSize = 5;
      for (let i = 0; i < pageAwareChunks.length; i += batchSize) {
        const batch = pageAwareChunks.slice(i, i + batchSize);
        const batchPromises = batch.map(async (item, indexInBatch) => {
          const chunkIndex = i + indexInBatch;
          const embedding = await getEmbedding(item.text);
          return {
            id: `chunk_${paperId}_${chunkIndex}`,
            userId,
            paperId,
            paperName,
            text: item.text,
            index: chunkIndex,
            embedding,
            pageNumber: item.pageNumber
          };
        });

        const resolvedBatch = await Promise.all(batchPromises);
        chunks.push(...resolvedBatch);
      }

      const newPaper: Paper = {
        id: paperId,
        userId,
        name: paperName,
        size,
        uploadDate: new Date().toISOString(),
        chunkCount: chunks.length
      };

      // Save paper metadata, embedding chunks, and full text to persistent store.
      // Full text is kept separately so full-paper summarization and
      // multi-paper comparison can use it without re-parsing the PDF.
      await addPaper(newPaper);
      await addChunks(chunks);
      await setPaperText(userId, paperId, fullText);

      res.json({ success: true, paper: newPaper });
    } catch (error: any) {
      console.error('Error processing paper:', error);
      res.status(500).json({ error: error.message || 'Failed to upload and process paper.' });
    }
  });

  // 2.5. Import paper from a link/URL (e.g., ArXiv PDF link or direct PDF)
  api.post('/papers/link', async (req, res) => {
    try {
      const userId = req.user!.id;
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required.' });
      }

      let fetchUrl = url.trim();

      // If it's an ArXiv abstract link, rewrite it to direct PDF
      // e.g. https://arxiv.org/abs/1706.03762 -> https://arxiv.org/pdf/1706.03762.pdf
      if (fetchUrl.includes('arxiv.org/abs/')) {
        fetchUrl = fetchUrl.replace('arxiv.org/abs/', 'arxiv.org/pdf/') + '.pdf';
      }

      // Check for duplicates (scoped to this user)
      const existingPapers = await getPapers(userId);
      const derivedName = fetchUrl.split('/').pop() || 'linked-document.pdf';
      const paperName = derivedName.endsWith('.pdf') ? derivedName : `${derivedName}.pdf`;

      if (existingPapers.some(p => p.name === paperName)) {
        return res.status(400).json({ error: `A research paper named "${paperName}" has already been indexed.` });
      }

      // Fetch PDF from remote URL
      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to download document from URL. Status: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extract text from PDF buffer, tracking page boundaries as we go
      let extraction;
      try {
        extraction = await extractPdfPages(buffer);
      } catch (pdfError: any) {
        console.error('PDF parsing error from link:', pdfError);
        return res.status(400).json({ error: 'Failed to extract text from the PDF URL. The link must point to a valid PDF file.' });
      }

      const { pages, fullText } = extraction;
      if (!fullText.trim()) {
        return res.status(400).json({ error: 'Extracted text is empty. This PDF might contain scanned images without OCR text.' });
      }

      // Chunk text per-page (~400 words with 50-word overlap) so every chunk
      // can be tagged with the page number it came from.
      const pageAwareChunks: { text: string; pageNumber: number }[] = [];
      for (const page of pages) {
        const pageChunks = chunkText(page.text, 400, 50);
        for (const c of pageChunks) {
          pageAwareChunks.push({ text: c, pageNumber: page.pageNumber });
        }
      }
      if (pageAwareChunks.length === 0) {
        return res.status(400).json({ error: 'Extracted text was too short to create semantic chunks.' });
      }

      const paperId = 'paper_' + Date.now().toString();

      // Generate embedding vectors in small, safe concurrent batches of 5
      const chunks: Chunk[] = [];
      const batchSize = 5;
      for (let i = 0; i < pageAwareChunks.length; i += batchSize) {
        const batch = pageAwareChunks.slice(i, i + batchSize);
        const batchPromises = batch.map(async (item, indexInBatch) => {
          const chunkIndex = i + indexInBatch;
          const embedding = await getEmbedding(item.text);
          return {
            id: `chunk_${paperId}_${chunkIndex}`,
            userId,
            paperId,
            paperName,
            text: item.text,
            index: chunkIndex,
            embedding,
            pageNumber: item.pageNumber
          };
        });

        const resolvedBatch = await Promise.all(batchPromises);
        chunks.push(...resolvedBatch);
      }

      const newPaper: Paper = {
        id: paperId,
        userId,
        name: paperName,
        size: buffer.length,
        uploadDate: new Date().toISOString(),
        chunkCount: chunks.length
      };

      // Save paper metadata, embedding chunks, and full text to persistent store.
      await addPaper(newPaper);
      await addChunks(chunks);
      await setPaperText(userId, paperId, fullText);

      res.json({ success: true, paper: newPaper });
    } catch (error: any) {
      console.error('Error processing paper link:', error);
      res.status(500).json({ error: error.message || 'Failed to index paper from URL.' });
    }
  });

  // 3. Delete a paper and all its embedding chunks
  api.delete('/papers/:id', async (req, res) => {
    try {
      const userId = req.user!.id;
      const paperId = req.params.id;
      const papers = await getPapers(userId);
      const paperToDelete = papers.find(p => p.id === paperId);

      if (!paperToDelete) {
        return res.status(404).json({ error: 'Research paper not found.' });
      }

      await deletePaper(userId, paperId);
      res.json({ success: true, message: `Successfully deleted paper and its embeddings.` });
    } catch (error: any) {
      console.error('Error deleting paper:', error);
      res.status(500).json({ error: error.message || 'Failed to delete research paper.' });
    }
  });

  // 4. Query RAG engine (ask a question)
  api.post('/chat/ask', async (req, res) => {
    try {
      const userId = req.user!.id;
      const { question, filterPaperId } = req.body;
      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'Question is required.' });
      }

      const userMsg: ChatMessage = {
        id: 'msg_' + Date.now().toString(),
        userId,
        role: 'user',
        content: question,
        timestamp: new Date().toISOString()
      };
      await addChatMessage(userMsg);

      // Fetch this user's chunks only for matching
      const userChunks = await getChunks(userId);

      // Query RAG
      const ragResult = await queryRAG(question, userChunks, filterPaperId);

      const assistantMsg: ChatMessage = {
        id: 'msg_' + (Date.now() + 1).toString(),
        userId,
        role: 'assistant',
        content: ragResult.answer,
        timestamp: new Date().toISOString(),
        sources: ragResult.sources
      };
      await addChatMessage(assistantMsg);

      res.json({
        message: assistantMsg,
        lowConfidence: ragResult.lowConfidence
      });
    } catch (error: any) {
      console.error('Error during RAG chat query:', error);
      res.status(500).json({ error: error.message || 'Failed to query research assistant.' });
    }
  });

  // 5a. Full-paper summarization — sends the ENTIRE text of one paper to
  // Gemini's large context window. Deliberately separate from the
  // chunk-based RAG Q&A flow above (no embedding/retrieval step here).
  api.post('/papers/:id/summarize', async (req, res) => {
    try {
      const userId = req.user!.id;
      const paperId = req.params.id;
      const papers = await getPapers(userId);
      const paper = papers.find(p => p.id === paperId);
      if (!paper) {
        return res.status(404).json({ error: 'Research paper not found.' });
      }

      const fullText = await getPaperText(userId, paperId);
      if (!fullText || !fullText.trim()) {
        return res.status(400).json({ error: 'Full text for this paper is not available. Try re-uploading it.' });
      }

      const summaryContent = await summarizePaper(paper.name, fullText);

      res.json({
        summary: {
          paperId: paper.id,
          paperName: paper.name,
          ...summaryContent
        }
      });
    } catch (error: any) {
      console.error('Error summarizing paper:', error);
      res.status(500).json({ error: error.message || 'Failed to summarize paper.' });
    }
  });

  // 5b. Multi-paper comparison — retrieves each selected paper's own
  // top-matching chunks for the question, then asks Gemini to compare and
  // contrast across papers with explicit per-paper attribution.
  api.post('/papers/compare', async (req, res) => {
    try {
      const userId = req.user!.id;
      const { question, paperIds } = req.body;
      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'A comparison question is required.' });
      }
      if (!Array.isArray(paperIds) || paperIds.length < 2) {
        return res.status(400).json({ error: 'Select at least two papers to compare.' });
      }

      const papers = await getPapers(userId);
      const paperNames: Record<string, string> = {};
      papers.forEach(p => { paperNames[p.id] = p.name; });

      const missing = paperIds.filter((id: string) => !paperNames[id]);
      if (missing.length > 0) {
        return res.status(404).json({ error: 'One or more selected papers could not be found.' });
      }

      const userChunks = await getChunks(userId);
      const result = await compareAcrossPapers(question, userChunks, paperIds, paperNames);

      res.json({
        answer: result.answer,
        sourcesByPaper: result.sourcesByPaper
      });
    } catch (error: any) {
      console.error('Error comparing papers:', error);
      res.status(500).json({ error: error.message || 'Failed to compare papers.' });
    }
  });

  // 6. Get chat history
  api.get('/chat/history', async (req, res) => {
    try {
      const chats = await getChatHistory(req.user!.id);
      res.json(chats);
    } catch (error: any) {
      console.error('Error fetching chat history:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch chat history.' });
    }
  });

  // 7. Clear chat history
  api.delete('/chat/history', async (req, res) => {
    try {
      await clearChatHistory(req.user!.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error clearing chat history:', error);
      res.status(500).json({ error: error.message || 'Failed to clear chat history.' });
    }
  });

  app.use('/api', api);

  // --- VITE DEV SERVER / PRODUCTION STATIC SERVING ---

  if (process.env.NODE_ENV !== "production") {
    // Mount Vite dev server in middleware mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from compiled dist directory
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ScholarMind Server] Running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
  });
}

startServer();
