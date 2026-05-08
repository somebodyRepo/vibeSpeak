# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

vibeSpeak is a speech-to-text application with real-time streaming ASR and batch file transcription, extended with research project management capabilities. It supports Mandarin and Sichuan dialect recognition with LLM-powered text polishing and structured information extraction. Stack: FastAPI + FunASR (SenseVoice) backend, React + Vite + Tailwind frontend.

## Development Commands

### Using Makefile (recommended)
```bash
make install           # Install all dependencies
make dev-backend       # Start backend on :8000
make dev-frontend      # Start frontend on :5173
make lint-backend      # ruff check + black
make lint-frontend     # npm run lint
make docker-up         # docker-compose up -d
make docker-logs       # Follow container logs
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

## Architecture

### Backend (`backend/app/`)

**Database Models** (`models/database.py`):
- `TranscriptionTaskDB` / `RealtimeSessionDB` - Original ASR tasks
- `OutlineDB` - Research outline templates (JSON content)
- `ProjectDB` - Research projects (links to outline)
- `InterviewSessionDB` - Interview sessions with processing pipeline: `pending → transcribing → extracting → validating → done`

**API Endpoints** (`api/`):
- `transcribe.py` - Batch audio transcription
- `polish.py` - LLM text polishing
- `stream.py` - WebSocket streaming transcription
- `projects.py` - Project CRUD + export
- `outlines.py` - Outline management + JSON/Markdown import
- `sessions.py` - Session management + processing pipeline (transcribe → extract → validate → finalize) + exports

**Services**:
- `ASRService` - FunASR SenseVoiceSmall + VAD, singleton with lazy init
- `LLMService` - OpenAI-compatible adapter with methods: `polish_batch()`, `polish_stream()`, `extract_info_by_outline()`, `validate_extraction()`, `generate_final_content()`

**Auth**: `AuthMiddleware` validates `Authorization: Bearer <token>`. WebSocket auth via `?token=` query param.

**WebSocket Protocol** (`/ws/realtime`):
```
Client: {"type":"init"} → Server: {"type":"ready","session_id":"..."}
Client: {"type":"audio","data":"base64_pcm"} → Server: {"type":"result","text":"...","is_final":false}
Client: {"type":"stop"} → Server: {"type":"complete"}
```

### Frontend (`frontend/src/`)

**Component Structure**:
- `layout/AppShell.tsx` - Root with NavBar (projects/record tabs), view routing
- `projects/` - ProjectList, ProjectEditor, OutlineEditor (JSON/Markdown import)
- `sessions/` - SessionList, SessionViewer (4-column layout), SessionImporter, SessionRecorder
- `export/` - ExportPanel (batch export with naming rules)

**State Management**:
- `hooks/useProjectStore.ts` - Zustand store for projects, outlines, sessions, view state
- `hooks/useAudioCapture.ts` - Web Audio API (Float32→Int16→base64)
- `hooks/useWebSocket.ts` - WebSocket with reconnection

**Design System** (Neumorphic):
- Fonts: Poppins (heading) + Open Sans (body)
- Colors: Primary `#3B82F6`, Secondary `#F97316`, Surface `#F8FAFC`
- Shadows: `shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04)]` for inputs, convex for cards

**Runtime Config**: `lib/config.ts` loads `/config.json` at startup. Empty `backend.host` = Caddy proxy mode (same-origin requests).

## Configuration

### Backend `.env`
| Variable | Description |
|----------|-------------|
| `HOST` | Listen address (`::` for IPv6) |
| `PORT` | Server port (default 8000) |
| `AUTH_TOKEN` | Bearer token (empty = disabled) |
| `LLM_BASE_URL` | OpenAI-compatible API URL |
| `LLM_API_KEY` | API key for LLM |
| `LLM_MODEL` | Model name (default: `gpt-4o`) |
| `ASR_DEVICE` | `auto`, `cpu`, `mps`, `cuda` |

### Frontend `public/config.json`
```json
{
  "backend": { "host": "" },
  "auth": { "token": "your-token" }
}
```
Empty `host` = Caddy proxy mode.

## Key Constraints

- Audio: 16kHz mono PCM (ffmpeg converts uploads)
- Requires `ffmpeg`/`ffprobe` on PATH
- Microphone requires localhost or HTTPS
- Streaming ASR accumulates ~1s audio chunks before inference
- No test suite (pytest in dev deps but no `tests/` dir)
