# ArtSango AI

ArtSango AI is a Next.js MVP that provides a ChatGPT-like assistant for artisans, powered by OpenAI.

## What is included

- Chat interface with sidebar history
- AI modes:
  - Product description
  - Improve text
  - Price suggestion
  - Social media posts
- Product creation page at `/products/new`
- Backend route `POST /api/ai-chat` using OpenAI SDK
- Firebase-free mock persistence layer (in-memory)

## Stack

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- OpenAI Node SDK

## Environment variables

Create `.env.local` from `.env.example`.

Required:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `NEXT_PUBLIC_DEMO_USER_ID` (default: `artisan-demo`)

## Local run

```bash
npm install
npm run dev
```

Open:

- Chat: `http://localhost:3000/`
- Product page: `http://localhost:3000/products/new`

## Production build check

```bash
npm run build
npm run start
```

## API routes

- `POST /api/ai-chat`
  - body: `{ userId, message, mode, conversationId?, attachments? }`
- `GET /api/conversations?userId=...`
- `GET /api/conversations/:conversationId/messages?userId=...`
- `GET /api/products?userId=...`
- `POST /api/products`

## Deployment prep

### Push to GitHub

```bash
git init
git add .
git commit -m "feat: production-ready OpenAI MVP"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

### Deploy to Vercel

1. Import the GitHub repository in Vercel.
2. Framework preset: Next.js.
3. Set project environment variables in Vercel:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional)
   - `NEXT_PUBLIC_DEMO_USER_ID` (optional)
4. Deploy.

## Current persistence behavior

Firebase is disabled for now. Data is stored in-memory in the running server process. This is enough for MVP/demo but is not durable across server restarts or scale-out instances.
