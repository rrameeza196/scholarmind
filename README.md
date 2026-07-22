# ScholarMind

**A RAG-powered research assistant built on the Gemini API — read, question, summarize, and compare academic papers in one workspace.**

🏆 **Winner — Best Use of Gemini API**, [Code with Gemini API](https://code-api.devpost.com/) hackathon on Devpost.
[View the Devpost submission →](https://devpost.com/software/scholarmind-rag-assistant-for-research-papers)

📺 [Watch the demo video](https://www.youtube.com/watch?v=YKc3ffXCFiI)

ScholarMind helps students and researchers work through dense academic PDFs faster. Upload papers, ask grounded questions with page-level citations, generate structured full-paper summaries, or compare multiple papers side-by-side — all backed by Google's Gemini API.

---

## 📸 Screenshots

**Dashboard**
(screenshots/dashboard.png)

**Paper Library**
(screenshots/library.png)

**Ask Your Papers (Grounded Q&A)**
(screenshots/ask-papers.png)

**Full-Paper Summarization**
(screenshots/summarize.png)

**Multi-Paper Comparison**
(screenshots/compare.png)

---

## ✨ Features

- **📚 Paper Library** — Upload PDFs or paste an arXiv link directly; papers are automatically parsed, chunked, and embedded for retrieval.
- **💬 Grounded Q&A (RAG)** — Ask questions about a paper and get answers strictly grounded in the source text, with inline `[Source X]` citations and exact **page numbers**.
- **📝 Full-Paper Summarization** — Sends the entire text of a paper to Gemini's large context window (no chunking) and returns a structured summary: research problem, methodology, key findings, and conclusion.
- **⚖️ Multi-Paper Comparison** — Select 2+ papers and ask a comparison question. Gemini retrieves relevant context from each paper independently and produces an answer that explicitly attributes every point to the correct paper by name.
- **📄 Page-Level Citations** — Every chunk is tagged with the PDF page it was extracted from, so every citation is independently verifiable.
- **🔐 Real Authentication** — Sign in with Google (OAuth) or continue as a guest. Each account has its own private paper library, chats, and embeddings — no shared data between users.

## 🧠 How the Gemini API is used

| Capability | Model | Purpose |
|---|---|---|
| Embeddings | `gemini-embedding-2-preview` | Converts paper chunks and questions into vectors for semantic search |
| Grounded Q&A | `gemini-3.5-flash` | Answers questions using only retrieved chunks, with citations |
| Full-context summarization | `gemini-3.5-flash` | Reads a paper's entire text in one call and returns a structured JSON summary |
| Multi-paper comparison | `gemini-3.5-flash` | Compares per-paper retrieved context and attributes claims to the correct source |

## 🏗️ Tech Stack

- **Frontend:** React + Vite + TailwindCSS
- **Backend:** Express (TypeScript, ESM), served via `tsx` in dev and bundled with `esbuild` for production
- **AI:** Google Gemini API (`@google/genai`)
- **PDF parsing:** `pdf-parse` (page-aware extraction)
- **Storage:** Lightweight JSON file store (`db.json`) — no external database required

## 🔑 Setting Up Google Sign-In (free)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create or select a project.
2. **APIs & Services → OAuth consent screen** → choose **External**, fill in app name + your email, add scopes `email`, `profile`, `openid`. You can leave it in "Testing" mode for a hackathon demo (add your test users), or publish it.
3. **APIs & Services → Credentials → Create Credentials → OAuth Client ID** → Application type: **Web application**.
4. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (for local dev)
   - your deployed URL, e.g. `https://scholarmind.onrender.com`
   - *(No redirect URI is needed — the Google Identity Services button flow doesn't use one.)*
5. Copy the generated **Client ID** (looks like `xxxx.apps.googleusercontent.com`) and set it as **both** of these in your `.env.local`:
   ```
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   ```
   (Same value, two names — one is read by the server, the other is bundled into the frontend by Vite.)

If these aren't set, the app still works — the sign-in screen just shows "Continue as Guest" only, and Google sign-in is hidden.

## 🚀 Getting Started (Local)

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/<your-username>/scholarmind.git
cd scholarmind
npm install
```

Create a `.env.local` file in the project root:

```
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_CLIENT_ID=your_google_oauth_client_id
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

Run the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## 📦 Production Build

```bash
npm run build
npm run start
```

This bundles the frontend into `dist/` and the server into `dist/server.cjs`, then serves everything from a single Node process on `PORT` (default `3000`).

## 🌐 Deployment (Render — free tier)

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New +** → **Web Service** → connect your GitHub repo.
3. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Environment:** Node
4. Under **Environment Variables**, add:
   - `GEMINI_API_KEY` = your Gemini API key
   - `GOOGLE_CLIENT_ID` = your Google OAuth Client ID
   - `VITE_GOOGLE_CLIENT_ID` = the same Client ID
   - `NODE_ENV` = `production`
5. Deploy. Render will give you a public URL like `https://scholarmind.onrender.com`.
6. **Important:** go back to Google Cloud Console → your OAuth Client → add this Render URL to **Authorized JavaScript origins** (it wasn't known until now).

> Note: Render's free tier spins down after inactivity, so the first request after idle time may take ~30s to wake up — worth mentioning to judges if they hit it cold.

**Alternative:** Railway, Fly.io, or Google Cloud Run work the same way — set `GEMINI_API_KEY` and `NODE_ENV=production` as environment variables/secrets, build with `npm run build`, start with `npm run start`.

## 📁 Project Structure

```
scholarmind/
├── server.ts              # Express server & API routes
├── server/
│   ├── ragEngine.ts        # Embeddings, retrieval, Q&A, summarization, comparison
│   ├── pdfUtils.ts         # Page-aware PDF text extraction
│   └── dbStore.ts          # JSON-based persistence
├── src/
│   ├── App.tsx             # Main app shell & tab routing
│   ├── components/         # Ask, Library, Dashboard, Summarize, Compare tabs
│   └── types.ts            # Shared TypeScript types
├── screenshots/            # README screenshots
└── db.json                 # Generated at runtime — papers, chunks, embeddings, chats
```

## 🎓 Project Context

Built as part of a Final Year Project on **benchmarking computer vision models for edge devices**. The demo library includes papers such as MCUBench, YOLO-based edge/MCU benchmarks, and related literature — but ScholarMind works with any academic PDF.

## 📄 License

MIT
