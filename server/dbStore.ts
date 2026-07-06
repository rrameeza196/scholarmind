import { promises as fs } from 'fs';
import path from 'path';
import { Paper, Chunk, ChatMessage, AuthUser } from '../src/types.js';

const DB_FILE = path.join(process.cwd(), 'db.json');

interface Schema {
  users: AuthUser[];
  /** Maps an opaque session token (stored in an httpOnly cookie) to a userId. */
  sessions: Record<string, string>;
  papers: Paper[];
  chunks: Chunk[];
  chats: ChatMessage[];
  /** Full extracted text per paper, keyed by `${userId}:${paperId}`. Used for
   * full-context summarization and multi-paper comparison (kept separate
   * from the chunked/embedded data used for RAG Q&A retrieval). */
  paperTexts: Record<string, string>;
}

let dbCache: Schema = {
  users: [],
  sessions: {},
  papers: [],
  chunks: [],
  chats: [],
  paperTexts: {}
};

let isLoaded = false;

async function loadDb() {
  if (isLoaded) return;
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    dbCache = JSON.parse(data);
    // Backfill for databases created before these fields existed.
    if (!dbCache.paperTexts) dbCache.paperTexts = {};
    if (!dbCache.users) dbCache.users = [];
    if (!dbCache.sessions) dbCache.sessions = {};
    isLoaded = true;
  } catch (error) {
    // If file doesn't exist or is corrupted, initialize with defaults
    dbCache = { users: [], sessions: {}, papers: [], chunks: [], chats: [], paperTexts: {} };
    await saveDb();
    isLoaded = true;
  }
}

async function saveDb() {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write database file:', error);
  }
}

function paperTextKey(userId: string, paperId: string): string {
  return `${userId}:${paperId}`;
}

// --- Users & Sessions ---

export async function getUserById(userId: string): Promise<AuthUser | undefined> {
  await loadDb();
  return dbCache.users.find(u => u.id === userId);
}

export async function getUserByGoogleId(googleId: string): Promise<AuthUser | undefined> {
  await loadDb();
  return dbCache.users.find(u => u.id === googleId);
}

export async function upsertUser(user: AuthUser): Promise<AuthUser> {
  await loadDb();
  const idx = dbCache.users.findIndex(u => u.id === user.id);
  if (idx >= 0) {
    dbCache.users[idx] = user;
  } else {
    dbCache.users.push(user);
  }
  await saveDb();
  return user;
}

export async function createSession(userId: string, sessionToken: string): Promise<void> {
  await loadDb();
  dbCache.sessions[sessionToken] = userId;
  await saveDb();
}

export async function getUserIdForSession(sessionToken: string): Promise<string | undefined> {
  await loadDb();
  return dbCache.sessions[sessionToken];
}

export async function deleteSession(sessionToken: string): Promise<void> {
  await loadDb();
  delete dbCache.sessions[sessionToken];
  await saveDb();
}

// --- Papers (scoped per user) ---

export async function getPapers(userId: string): Promise<Paper[]> {
  await loadDb();
  return dbCache.papers.filter(p => p.userId === userId);
}

export async function addPaper(paper: Paper): Promise<void> {
  await loadDb();
  dbCache.papers.push(paper);
  await saveDb();
}

export async function deletePaper(userId: string, paperId: string): Promise<void> {
  await loadDb();
  dbCache.papers = dbCache.papers.filter(p => !(p.id === paperId && p.userId === userId));
  dbCache.chunks = dbCache.chunks.filter(c => !(c.paperId === paperId && c.userId === userId));
  delete dbCache.paperTexts[paperTextKey(userId, paperId)];
  await saveDb();
}

export async function getPaperText(userId: string, paperId: string): Promise<string | undefined> {
  await loadDb();
  return dbCache.paperTexts[paperTextKey(userId, paperId)];
}

export async function setPaperText(userId: string, paperId: string, text: string): Promise<void> {
  await loadDb();
  dbCache.paperTexts[paperTextKey(userId, paperId)] = text;
  await saveDb();
}

export async function getChunks(userId: string, paperId?: string): Promise<Chunk[]> {
  await loadDb();
  const userChunks = dbCache.chunks.filter(c => c.userId === userId);
  if (paperId) {
    return userChunks.filter(c => c.paperId === paperId);
  }
  return userChunks;
}

export async function addChunks(newChunks: Chunk[]): Promise<void> {
  await loadDb();
  dbCache.chunks.push(...newChunks);
  await saveDb();
}

// --- Chat history (scoped per user) ---

export async function getChatHistory(userId: string): Promise<ChatMessage[]> {
  await loadDb();
  return dbCache.chats.filter(c => c.userId === userId);
}

export async function addChatMessage(message: ChatMessage): Promise<void> {
  await loadDb();
  dbCache.chats.push(message);
  await saveDb();
}

export async function clearChatHistory(userId: string): Promise<void> {
  await loadDb();
  dbCache.chats = dbCache.chats.filter(c => c.userId !== userId);
  await saveDb();
}
