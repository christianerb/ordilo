# Ordilo

Ordilo is an AI-native web app that helps families organize their important
documents. It has a German UI and turns scans and uploads into a structured,
searchable knowledge base. Capture a document, let Ordilo run OCR and LLM-based
extraction, review the result, and confirm it to build a family knowledge graph
that powers semantic search and conversational Q&A.

## Key features

- Magic-link authentication (passwordless email sign-in with PKCE).
- Conversational onboarding that creates a family and its members.
- App shell with five bottom-navigation tabs: Home, Scan, Suche (Search),
  Familie (Family), and Aufgaben (Tasks).
- Document capture and upload with OCR via the Datalab API.
- LLM extraction of structured fields, dates, and entities.
- Review card to verify and correct extracted data before confirming.
- On confirm, Ordilo builds knowledge-graph nodes and edges and generates
  vector embeddings.
- Semantic and graph-aware search plus a chat assistant grounded in the
  family's documents.

## Tech stack

- Next.js 15 (App Router) with TypeScript
- Tailwind CSS v4 and shadcn/ui (Radix UI primitives)
- Supabase: Postgres, Auth (magic link / PKCE), Storage, and pgvector
- OpenAI: GPT-4.1 Mini for extraction and chat, text-embedding-3-small for
  embeddings
- Datalab API for OCR
- Vitest for tests

## Prerequisites

- Node.js 20 or newer
- A Supabase project (Postgres with the pgvector extension enabled)
- API keys for OpenAI and Datalab

## Environment variables

Create a `.env.local` file (see `.env.example`) and set the following names.
Do not commit real secret values.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `DATALAB_API_KEY`

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and fill in your own values:

   ```bash
   cp .env.example .env.local
   ```

3. Apply the database migrations to your Supabase project (see
   [Database migrations](#database-migrations)).

## Running the app

The app expects to run on port 3100 (auth redirects and callbacks are wired to
`http://localhost:3100`). Start the dev server with:

```bash
npm run dev -- -p 3100
```

Then open http://localhost:3100.

## Scripts

- `npm run dev` - start the Next.js dev server
- `npm run build` - create a production build
- `npm run start` - run the production build
- `npm run lint` - run ESLint
- `npm run typecheck` - run the TypeScript compiler with no emit
- `npm run test` - run the Vitest suite once
- `npm run test:watch` - run Vitest in watch mode

## Architecture overview

- `src/app` uses the Next.js App Router. Route groups separate concerns:
  `(auth)` for login and the auth callback, `(app)` for the authenticated shell
  and its tabs (home, scan, suche, familie, aufgaben, onboarding), and `api`
  for route handlers (chat, documents, search, me, and dev-auth).
- `src/lib/ai` holds the AI pipeline: `ocr.ts`, `extraction.ts`,
  `embeddings.ts`, `search.ts`, and `chat.ts`.
- `src/lib/supabase` contains the browser, server, and middleware Supabase
  clients; `src/middleware.ts` refreshes sessions and guards protected routes.
- `src/lib/schemas` holds the Zod schemas used for validation across the app.
- `src/components` contains shared UI components built on shadcn/ui and Radix.
- Document processing flow: upload to Supabase Storage, run Datalab OCR, extract
  structured data with GPT-4.1 Mini, review and confirm, then persist
  knowledge-graph nodes and edges with text-embedding-3-small embeddings for
  semantic and graph search.

## Database migrations

SQL migrations live in `supabase/migrations` and are applied to your Supabase
project in order (for example via the Supabase SQL editor or the Supabase CLI).
They define the schema, semantic-search RPCs, the confirm RPC and atomicity
constraints, and onboarding-related tables and markers. Ensure the pgvector
extension is enabled so embedding columns and similarity search work.
