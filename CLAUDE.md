# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

vibeSpeak is a speech-to-text application with real-time streaming ASR and batch file transcription, extended with research project management capabilities. It supports Mandarin and Sichuan dialect recognition with LLM-powered text polishing and structured information extraction. The Table Summary feature enables batch table generation from interview content with progress tracking and export (Markdown/Excel). Stack: FastAPI + FunASR (SenseVoice) backend, React + Vite + Tailwind frontend.

## Development Commands

### Using Makefile (recommended)
```bash
make install           # Install all dependencies
make dev-backend       # Start backend on :8000
make dev-frontend      # Start frontend on :5173
make test-backend      # Run pytest (all tests)
make lint-backend      # ruff check + black --check
make lint-frontend     # npm run lint
make build             # Build both frontend and backend
make clean             # Remove build artifacts
```

### Backend (from `backend/` directory)
```bash
python3.11 -m venv venv && source venv/bin/activate
pip install -e ".[dev]"

# Development
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Testing
pytest                                    # Run all tests
pytest tests/test_api_projects.py -v      # Run specific test file
pytest -k "design_table" -v               # Run tests matching pattern

# Linting
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

**Entry Point** (`main.py`):
- FastAPI with lifespan context manager
- AuthMiddleware added before CORS
- Routers: transcribe, polish, outlines, projects, sessions
- Health check at `/api/health`

**Configuration** (`core/config.py`):
- Pydantic Settings with `.env` file loading
- Key settings: `database_url` (SQLite), `llm_base_url`/`llm_api_key`/`llm_model`, `asr_device`, `auth_token`
- Auto-enables auth if `auth_token` is set

**Auth** (`core/auth.py`):
- `AuthMiddleware`: Bearer token validation, constant-time comparison
- Public paths: `/`, `/docs`, `/openapi.json`, `/redoc`, `/api/health`, `/ws/*`
- WebSocket auth via `?token=` query param

**Database** (`models/database.py`):
- SQLAlchemy async with aiosqlite
- Models: `TranscriptionTaskDB`, `RealtimeSessionDB`, `OutlineDB`, `ProjectDB`, `InterviewSessionDB`
- Session status pipeline: `pending → transcribing → extracting → validating → done → tabled`
- Migration: `_run_migrations()` handles schema changes for existing SQLite databases

**Services** (`services/`):
- `ASRService`: Singleton, lazy init, thread-safe. FunASR SenseVoiceSmall + VAD. Device auto-detection (cuda/mps/cpu).
- `LLMService`: Singleton, OpenAI-compatible adapter. Async and sync versions. Table methods: `design_table_structure_prompt()`, `generate_session_table()`, `summarize_tables()`.
- `BatchTableGenerationService`: Singleton, manages async batch processing with queue and concurrency limits (max 3 concurrent). Progress tracking per project.

**API Endpoints** (`api/`):
- `transcribe.py`: Batch audio upload and transcription
- `polish.py`: LLM text polishing (batch and streaming SSE)
- `projects.py`: Project CRUD, table structure design, batch generation, summary integration, export (md/xlsx)
- `outlines.py`: Outline management + JSON/Markdown import
- `sessions.py`: Session CRUD, processing pipeline, table generation, exports

### Frontend (`frontend/src/`)

**Entry Points**:
- `main.tsx`: Loads `/config.json`, then renders App
- `App.tsx`: Routes based on view state

**State Management** (`hooks/useProjectStore.ts`):
- Zustand store for: projects, selectedProject, outlines, sessions, selectedSession, view, isLoading, error
- View states: `'project-list' | 'project-detail' | 'session-detail' | 'recording'`

**Audio Hooks**:
- `useAudioCapture.ts`: Web Audio API, Float32→Int16→base64 PCM for WebSocket streaming
- `useMediaRecorder.ts`: Local recording with MediaRecorder API, produces WebM/M4A blob

**API Client** (`lib/api.ts`):
- All backend API calls with auth header injection
- Streaming polish via manual SSE parsing
- Table-related APIs: design/update table structure, batch generation with progress polling, summarize, export

**Auth** (`lib/auth.ts`):
- Token sources (priority): localStorage > URL `?token=` param > config file
- `getAuthHeaders()` returns `Authorization: Bearer <token>`

**Config** (`lib/config.ts`):
- Runtime config from `/config.json`
- Empty `backend.host` = Caddy proxy mode (same-origin requests)

**Components**:
- `layout/AppShell.tsx`: Root layout with NavBar and tab routing (基本信息/访谈会话/表格汇总)
- `projects/`: ProjectList, ProjectEditor, OutlineEditor, ProjectDetailTabs, TableSummaryTab, TableStructurePromptEditor
- `sessions/`: SessionList (with batch table generation), SessionViewer (4-column layout), SessionTableView, SessionRecorder
- `export/`: ExportPanel with batch export

**Design System** (Neumorphic):
- Fonts: Poppins (heading) + Open Sans (body)
- Colors: Primary `#3B82F6`, Secondary `#F97316`, Surface `#F8FAFC`
- Shadows: `shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04)]` for inputs

## Configuration

### Backend `.env` (see `.env.example`)
| Variable | Description |
|----------|-------------|
| `DEBUG` | Enable debug logging |
| `HOST` | Listen address (`::` for IPv6) |
| `PORT` | Server port (default 8000) |
| `AUTH_TOKEN` | Bearer token (empty = disabled) |
| `LLM_BASE_URL` | OpenAI-compatible API URL |
| `LLM_API_KEY` | API key for LLM |
| `LLM_MODEL` | Model name (default: `gpt-4o`) |
| `ASR_DEVICE` | `auto`, `cpu`, `mps`, `cuda` |

The code uses `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` pattern.

### Frontend `public/config.json`
```json
{
  "backend": { "host": "" },
  "auth": { "token": "your-token" }
}
```
Empty `host` = Caddy proxy mode (same-origin requests).

## Testing

Test files are in `backend/tests/`. Uses pytest with pytest-asyncio.

- `conftest.py`: Fixtures for test database, client, sample data. Mocks torch/funasr dependencies.
- `test_api_projects.py`: API integration tests for project table endpoints
- `test_api_sessions.py`: API integration tests for session table endpoints
- `test_batch_service.py`: Unit tests for BatchTableGenerationService
- `test_llm_service.py`: Unit tests for LLMService table methods

## Key Constraints

- Audio: 16kHz mono PCM (ffmpeg converts uploads, accepts .wav/.mp3/.m4a/.flac/.ogg/.webm)
- Requires `ffmpeg`/`ffprobe` on PATH
- Microphone requires localhost or HTTPS
- Code style: black line-length=100, ruff line-length=100
- Docker: named volume `vibepeak-db` for SQLite persistence
- LLM prompts use Python `.format()` - escape literal `{` as `{{` and `}` as `}}`
