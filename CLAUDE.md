# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

vibeSpeak is a speech-to-text application with real-time streaming ASR and batch file transcription. It focuses on Mandarin and Sichuan dialect recognition, with LLM-powered text polishing. Stack: FastAPI + FunASR (SenseVoice) backend, React + Vite + Tailwind frontend.

## Development Commands

### Using Makefile (recommended)
```bash
make install           # Install all dependencies
make dev-backend       # Start backend on :8000
make dev-frontend       # Start frontend on :5173
make lint-backend       # ruff check + black
make lint-frontend       # npm run lint
make docker-up          # docker-compose up -d
make docker-logs        # Follow container logs
```

### Backend (from `backend/` directory)
```bash
python3.11 -m venv venv && source venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
ruff check app/ && black app/
```

### Frontend (from `frontend/` directory)
```bash
npm install
npm run dev       # :5173, proxies /api and /ws to :8000
npm run build     # tsc -b && vite build
npm run lint
```

### System Service (macOS launchctl)
```bash
cd backend && ./install-service.sh           # Install and start
launchctl list | grep vibespeak              # Check status
launchctl stop com.vibespeak.backend        # Stop
tail -f backend/logs/stderr.log              # View logs
```

## Architecture

### Backend (`backend/app/`)
- **Singleton services**: `ASRService` and `LLMService` are global singletons with async lazy initialization using `_lock` pattern. Models load on first use, not at startup.
- **Auth middleware**: `AuthMiddleware` in `core/auth.py` validates `Authorization: Bearer <token>` header. Public paths: `/`, `/docs`, `/openapi.json`, `/api/health`, `/ws/*`. WebSocket auth via `?token=` query param or header. Uses `secrets.compare_digest` for timing-safe comparison.
- **ASR pipeline**: FunASR `AutoModel` with `iic/SenseVoiceSmall` + VAD model. Device auto-selects (MPS > CUDA > CPU). `rich_transcription_postprocess` cleans output. Streaming mode accumulates ~1s audio chunks before inference.
- **LLM polish**: OpenAI-compatible API adapter. Configure via `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` env vars. Supports batch and SSE streaming modes. Four prompt styles: `standard` (Sichuan→书面), `formal`, `concise`, and `summary` (会议纪要).
- **WebSocket protocol** (`/ws/realtime`): Client sends `{"type":"init"}` → Server responds `{"type":"ready","session_id":"..."}` → Client sends `{"type":"audio","data":"base64_pcm"}` chunks → Server returns `{"type":"result","text":"...","is_final":false}` → Client sends `{"type":"stop"}` → Server sends `{"type":"complete"}`.

### Frontend (`frontend/src/`)
- **Runtime config**: `lib/config.ts` loads `/config.json` at startup for production deployment flexibility. Falls back to defaults if missing. Enables Caddy proxy mode (empty `backend.host` = relative paths).
- **AppShell**: Root layout with NavBar switching `realtime`/`batch` tabs.
- **Realtime mode**: `useAudioCapture` (Web Audio API, Float32→Int16→base64) + `useWebSocket`. Uses `optionsRef` to avoid stale closures in audio callback.
- **Batch mode**: REST uploads, polling for task status.
- **Auth**: `lib/auth.ts` stores token in localStorage. Token can be passed via URL `?token=` param. API calls include `Authorization` header.

## Configuration (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `HOST` | Listen address (`::` for IPv6, `0.0.0.0` for IPv4) |
| `PORT` | Server port (default 8000) |
| `AUTH_TOKEN` | Bearer token for API auth (empty = auto-disabled) |
| `LLM_BASE_URL` | OpenAI-compatible API base URL (required for polish) |
| `LLM_API_KEY` | API key for LLM service |
| `LLM_MODEL` | Model name (default: `gpt-4o`) |
| `ASR_DEVICE` | `auto`, `cpu`, `mps`, `cuda` |

## Frontend Production Config (`frontend/public/config.json`)

Deployed alongside frontend, enables runtime configuration without rebuild:
```json
{
  "backend": { "host": "" },
  "auth": { "token": "your-token" }
}
```
Empty `host` = Caddy proxy mode (same-origin requests).

## Key Constraints

- Audio: 16kHz mono PCM (ffmpeg converts uploads)
- Requires `ffmpeg`/`ffprobe` on PATH
- Microphone requires localhost or HTTPS (not HTTP + LAN IP)
- Streaming ASR accumulates ~1s audio chunks before inference
- No test suite currently exists (pytest in dev deps but no `tests/` dir)
