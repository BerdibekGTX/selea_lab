# Selea Arena

## Current interface

Selea uses a dark shadcn/ui sidebar, a chat studio, and working Leaderboard, Models, Analytics, Projects, Settings, Search, Help, and Account pages. The default route opens New Chat. The original dashboard block source remains on disk; its placeholder business metrics are no longer the default screen.

The sidebar is based on the official shadcn/ui `dashboard-01` block with Tailwind CSS 4. The pre-migration frontend is archived under `artifacts/before-shadcn-dashboard-20261107-203802.zip`.

## Local setup

Run the API in one terminal:

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Run the frontend in another:

```powershell
cd frontend
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open http://localhost:3000. Next.js proxies same-origin API requests to FastAPI.

## Features

- `/` and `/new` open the chat studio. Ask sends to one model; Compare sends to two models and accepts a vote after successful responses.
- New Chat clears the draft, references, instructions, and model selection. Model cards can also start a chat or a comparison with the chosen models.
- `/settings` accepts session-only OpenAI, Anthropic, and xAI keys. Development credentials can use OPENAI_API_KEY, ANTHROPIC_API_KEY, and XAI_API_KEY.
- Demo A and Demo B provide clearly labeled canned responses without paid requests.
- `/account` supports local email/password registration, sign-in, and sign-out. Guest chats transfer to the account on sign-in or registration.
- `/history/search` searches saved chat titles. Recents opens the latest eight chats. Chats and votes persist in backend/arena.db.
- Leaderboard and Analytics show the current workspace's actual activity and votes. `/dashboard` opens the same real analytics, replacing template revenue data.
- Projects supports local browser notes, editing, search, archiving, and restoring.
- References accept .txt, .md, .csv, and .json files up to 30 KB; the combined prompt, instructions, and reference must fit within 12,000 characters.
- `/help` documents controls and limits. Unsupported template Billing and Notifications entries have been removed.

## Limits

This local implementation has no access to Arena's private services or public vote database. Live provider calls require credentials. Agent mode produces HTML prototypes. Image/video generation, browser agents, full-stack deployment, OAuth, email verification/recovery and global crowdsourced rankings are not implemented.

Provider calls are limited to 10 turns per chat and 20 requests per session per minute. A $2 estimated chat budget uses installed LiteLLM pricing plus a 25% reserve. Unknown pricing is blocked. Provider billing can differ from estimates; use provider-side spending limits for a billing guarantee. Request limits and locks are process-local, so run one API worker.

Provider keys are stored only in backend process memory under the current session token hash, expire with that session, and are cleared on sign-in or sign-out. They are never returned to the frontend, persisted in SQLite/browser storage, or saved with chats. Restarting the API clears all keys. Set COOKIE_SECURE=true for HTTPS deployments.

The installed Next.js version reports a security advisory. Update it before public deployment.

## Validation

```powershell
cd backend
python -m pytest -q
cd ../frontend
npm run typecheck
npm run build
```

The previous app and its database are backed up in the sibling directory ai-arena-backup-20261106-172954.


For isolated local UI tests, set `ARENA_DATABASE` to a temporary SQLite path and start the API on another port. Set frontend `SELEA_API_URL` to that API URL and `SELEA_DIST_DIR` to a separate build directory before starting Next on another port. These environment overrides are server-only.
