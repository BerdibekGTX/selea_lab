# Selea manual-video Arena

This implementation adds a separate video arena to the existing Next.js + FastAPI + SQLite project. It does **not** use paid generation APIs: staff generate videos externally and upload them. Public comparisons are anonymous until a vote has been stored.

## Start locally

Use Python 3.11+ and Node 20+. From the repository root:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
cd frontend && npm ci && cd ..
```

Run the API in one terminal:

```bash
cd backend
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Run the UI in another:

```bash
cd frontend
npm run dev -- --hostname localhost --port 3000
```

Open `http://localhost:3000/arena`. On Windows use `.venv\Scripts\python.exe` instead of `.venv/bin/python`. The existing text-chat prototype remains at `/new`.

The API creates existing tables and applies the idempotent `backend/migrations/001_video_arena.sql` schema at startup. Back up the database before upgrades. For production, set `ARENA_DATABASE` and `SELEA_MEDIA_DIR` to paths on persistent storage and back up **both**. SQLite is suitable for a single API worker; do not run multiple workers against this local setup without revisiting write concurrency and rate limiting.

## Windows PowerShell quick start

From the project root, install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
cd frontend
npm ci
cd ..
```

Run the API in one terminal:

```powershell
cd backend
..\.venv\Scripts\python.exe -m app.admin_setup
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Create the administrator once, entering credentials privately at the console. In a second terminal:

```powershell
cd frontend
npm run dev -- --hostname localhost --port 3000
```

## Create an administrator

On a private server console, after dependencies are installed:

```bash
cd backend
../.venv/bin/python -m app.admin_setup
```

Enter a **new** administrator email and a 12+ character password at the prompts. The command refuses to promote an existing account. Then sign in at `/account` and open `/admin`. Do not put the password in chat, shell history, a URL, or an environment file. The public `/api/auth/register` endpoint never grants administrator access.

## Interface integration

The original sidebar, theme, fonts, and shared section header are retained. No extra sidebar items are added.

- New Chat → **Compare videos** opens `/arena`.
- Leaderboard → **Video rankings**, or the existing Video category menu, opens separate Text-to-Video and Image-to-Video results. Choose **Public votes** or **Selea team evaluations**.
- Models → **Video** lists models with active published comparisons.
- Projects → **Video challenges** opens published challenges and the proposal form.
- Settings → **Administration** opens `/admin`. Every admin API request requires a server-verified administrator account. The Account page also links to administration after an admin signs in.
- Get Help → **Methodology** explains selection, voting, and scoring.

The admin screen uses four tabs: Models & challenges, Generation runs, Outputs & publication, and Review & export. Form input is retained after recoverable failures.

## Operating workflow

1. In `/admin`, create at least two model records (name, provider, version, active status).
2. Create a Text-to-Video or Image-to-Video challenge draft. Record the prompt, evaluation criterion, and output-selection policy. The default is `first-successful`; deviations require an explanation.
3. For Image-to-Video, upload the source image before publication.
4. Record generation runs for each model. Include platform, generation date, JSON settings, attempt number, status, and retry reason for attempt 2+.
5. Upload MP4/WebM outputs to successful runs with duration, resolution, audio setting, and optional thumbnail; then publish each reviewed output. The server validates media type and content, remuxes videos and re-encodes images to remove embedded file metadata, and stores neutral UUID filenames. **Inspect the actual frames and audio for visible or audible model/platform branding before publication.**
6. Generate eligible first-successful pairs (or create a pair manually), preview anonymously, and publish the challenge and pair.
7. Visitors use `/arena` or a challenge page to compare and vote. The same participant cookie can vote only once per pair. After a saved vote, model/provider/platform/settings are revealed.
8. Review separate public and team rankings in `/video-leaderboard` or `/leaderboard/text-to-video` and `/leaderboard/image-to-video`. An admin can preview a published pair and submit a separate team evaluation. Withdrawal or vote invalidation removes results from active standings without deleting history.

Challenge proposals, vote flags/invalidation, and CSV export are also on the admin page. `/methodology` explains the scoring and anonymous-vote limitations.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `ARENA_DATABASE` | SQLite database file path | `backend/arena.db` |
| `SELEA_MEDIA_DIR` | Local media directory | `media` beside the database |
| `SELEA_API_URL` | Backend target for Next.js `/api` rewrite | `http://127.0.0.1:8000` |
| `SELEA_ORIGIN` | Comma-separated allowed browser origins for writes | `http://localhost:3000,http://127.0.0.1:3000` |
| `COOKIE_SECURE` | Set `true` for HTTPS so session cookies are Secure | unset |

Set `SELEA_API_URL` when building/starting Next.js if the API runs elsewhere. Set `SELEA_ORIGIN` to the exact HTTPS site origin in production. Do not expose the FastAPI port publicly without an appropriate reverse proxy and transport security. No Higgsfield, Alibaba Cloud, or model-provider credentials are needed for manual uploads.

## Integrity and limitations

- Public vote uniqueness is a database constraint on participant, comparison pair, and source. Repeating the same submission returns the original vote; conflicting repeats fail. IDs and A/B assignment are persisted server-side.
- The participant cookie lasts up to one year. Clearing cookies, using another browser/device, or coordinated abuse can bypass this identity; it is not account-level or fraud-proof voting. A per-participant 20-votes/minute and five-proposals/hour limit is a basic abuse guard, not distributed bot protection.
- Preference score is `(wins + 0.5 × ties) / (wins + losses + ties)`. Skips and both-bad are excluded; both-bad counts are displayed. Fewer than 20 scored outcomes are labelled preliminary.
- Local storage requires persistent disk and backups. There is no CDN or cloud object-storage integration yet. Uploads are capped at 200 MB per video and 10 MB per image. A crash during upload can leave a partial unreferenced file; routine media-directory reconciliation is not automated.
- Media files are metadata-scrubbed, but visual watermarks, spoken names, or identifying content inside frames/audio require human review. Scores are conditional on the chosen challenges and opponents.

## Verification

```bash
cd backend && ../.venv/bin/python -m pytest -q
cd ../frontend && npm run typecheck && npm run build
```

The API regression suite (20 passing tests, including text-chat regressions) covers challenge/model/run/output/pair creation, blind responses, vote retry/duplicate prevention, public/team rankings, withdrawal, authorization, draft media access, invalidation, and on-disk persistence. A fresh-process test verifies persisted rankings and media after reimporting the application. Local HTTP smoke checks verify the API and Next.js rewrite. Browser checks cover navigation, empty states, the original sidebar, video-model filtering, and mobile navigation. The admin publishing workflow is covered by API tests using synthetic MP4s; the complete browser upload/playback journey with real Higgsfield/Alibaba Cloud assets still requires acceptance after local administrator setup. No generated demo records are inserted into the normal database.
