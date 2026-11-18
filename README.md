# Selea

**Compare AI. See what leads.**

Selea is an AI model comparison platform for exploring how different models respond to the same task. Chat with a model, compare two responses side by side, or judge anonymous video outputs and contribute to their rankings.

Built for people evaluating AI for creative work, research, writing, and development.

## What you can do

- **Chat and compare** — ask one model or send the same prompt to two models. Add instructions and text references, then vote for the response you prefer.
- **Explore models** — search the catalog, filter by provider and access, compare specifications, and choose models for your next conversation.
- **Compare videos** — watch two uploaded outputs with matching playback controls. Model identities are revealed after your vote is saved.
- **Explore rankings** — see text model results from your workspace and separate video rankings from public votes and Selea team evaluations.
- **Track your workspace** — revisit conversations, search chat history, review activity and voting statistics, and organize ideas into projects.
- **Manage video evaluations** — administrators can create challenges, upload externally generated videos, publish comparison pairs, and review results.

## How comparisons work

In text comparisons, both models receive the same prompt. You can choose A, B, a tie, or neither response. Workspace rankings reflect your saved votes.

In Video Arena, each pair belongs to a challenge with a prompt and evaluation criterion. You judge the anonymous outputs before seeing which models produced them. Public and team evaluations have separate rankings. The methodology page explains how scores are calculated.

## Models and credentials

Text chat supports OpenAI, Anthropic, and xAI through LiteLLM. Bring your own provider keys in Settings, or try Demo A and Demo B with simulated responses and no API key.

User-provided provider keys are held in backend memory for the current session. Chats and votes are stored in SQLite. Projects are stored in the current browser. Video files use local media storage.

Video Arena compares videos generated externally and uploaded by administrators.

## Technology

- Next.js, TypeScript, and Tailwind CSS
- React components with shadcn/ui and BoardUI adaptations
- Python FastAPI
- SQLite and local media storage
- LiteLLM for text model providers

## Run locally

Install backend dependencies and start the API in one terminal.

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Install frontend dependencies and start the website in another terminal.

```powershell
cd frontend
npm ci
npm run dev -- --hostname localhost --port 3000
```

Open [localhost:3000](http://localhost:3000). Next.js forwards API requests to FastAPI.

For video administration, media configuration, publishing workflows, and deployment settings, see [the Video Arena guide](VIDEO_ARENA.md).

## Development checks

```powershell
cd backend
python -m pytest -q
cd ../frontend
npm run typecheck
npm run build
```

## MVP scope

Selea currently runs as a local workspace. Text model requests require provider credentials, except for the demo models. Text rankings reflect workspace votes. Video rankings reflect evaluations collected by this installation.

Provider requests have session rate limits, a maximum of 10 turns per chat, and a $2 estimated chat budget. Provider billing may differ from estimates. Run one API worker because request limits and locks are process-local.

For deployment, configure HTTPS cookies and persistent database and media paths using the Video Arena guide.
