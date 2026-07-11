# LyricLens

LyricLens is a Netlify-ready web app that explains user-provided lyrics in plain English. It returns the exact sections requested: overall meaning, background context, verse-by-verse explanation, slang, references, ambiguous lines, and final takeaway.

The workspace now includes a built-in demo lyric, optional context notes, lyric cleanup, word and line stats, autosaved drafts, pinned recent interpretation history, selectable interpretation lenses, searchable result sections, collapsible output, and `.txt`, `.md`, or `.json` exports.

For the full architecture, deployment, API flow, and troubleshooting notes, see [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md).

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add an OpenAI API key for local Netlify Function testing:

   ```bash
   cp .env.example .env
   ```

   In PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Then edit `.env` and set `OPENAI_API_KEY`.

3. Run the frontend:

   ```bash
   npm run dev
   ```

   For local API-function testing, run with Netlify:

   ```bash
   npm run dev:netlify
   ```

## Deploy to Netlify

1. Push this folder to a Git repository.
2. Create a new Netlify site from the repository.
3. Use these build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Add environment variables in Netlify:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` optional, defaults to `gpt-5.5`
   - `OPENAI_TIMEOUT_MS` optional, defaults to `45000`

The app calls the OpenAI Responses API from `netlify/functions/interpret.mjs`, so the API key is never exposed to the browser.
