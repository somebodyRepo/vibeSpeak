# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

vibeSpeak is a speech-to-text application with real-time streaming ASR and batch file transcription. It focuses on Mandarin and Sichuan dialect recognition, with LLM-powered text polishing. Stack: FastAPI + FunASR (SenseVoice) backend, React + Vite + Tailwind frontend.

## Development Commands

### Backend (from `backend/` directory)
```bash
python3.11 -m venv venv && source venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
ruff check app/ && black app/
pytest
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
- **Singleton services**: `ASRService` and `LLMService` are global singletons with async lazy initialization. Models load on first use.
- **Auth middleware**: `AuthMiddleware` in `core/auth.py` validates `Authorization: Bearer <token>` header. Public paths: `/`, `/docs`, `/openapi.json`, `/api/health`, `/ws/*`. WebSocket auth via `?token=` query param.
- **ASR pipeline**: FunASR `AutoModel` with `iic/SenseVoiceSmall` + VAD model. Device auto-selects (MPS > CUDA > CPU).
- **LLM polish**: OpenAI-compatible API adapter. Configure via `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` env vars. Batch and SSE streaming modes.
- **Database**: SQLite via SQLAlchemy async (`aiosqlite`). Tables: `transcription_tasks`, `realtime_sessions`.

### Frontend (`frontend/src/`)
- **AppShell**: Root layout with NavBar switching `realtime`/`batch` tabs.
- **Realtime mode**: `useAudioCapture` (Web Audio API, Float32→Int16→base64) + `useWebSocket`. Uses refs for callbacks to avoid stale closures.
- **Batch mode**: REST uploads, 5s polling for task status.
- **Auth**: `lib/auth.ts` stores token in localStorage. Token can be passed via URL `?token=` param. API calls include `Authorization` header.

## Configuration (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `HOST` | Listen address (`::` for IPv6, `0.0.0.0` for IPv4) |
| `PORT` | Server port (default 8000) |
| `AUTH_TOKEN` | Bearer token for API auth (empty = disabled) |
| `LLM_BASE_URL` | OpenAI-compatible API base URL |
| `LLM_API_KEY` | API key for LLM service |
| `LLM_MODEL` | Model name (default: `gpt-4o`) |
| `ASR_DEVICE` | `auto`, `cpu`, `mps`, `cuda` |

## Key Constraints

- Audio: 16kHz mono PCM (ffmpeg converts uploads)
- Requires `ffmpeg`/`ffprobe` on PATH
- Microphone requires localhost or HTTPS (not HTTP + LAN IP)
- Streaming ASR accumulates 3s buffers before inference (TODO: true chunk streaming)
