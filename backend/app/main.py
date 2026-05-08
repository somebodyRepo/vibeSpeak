from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import polish, transcribe, outlines, projects, sessions
from app.core.auth import AuthMiddleware
from app.core.config import get_settings
from app.models.database import init_db
from app.services.asr_service import asr_service
from app.services.llm_service import llm_service

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # Startup
    print(f"Starting {settings.app_name}...")
    print(f"Listening on {settings.host}:{settings.port}")
    if settings.auth_enabled:
        print(f"Authentication enabled")

    # Initialize database
    await init_db()
    print("Database initialized")

    # Initialize ASR (lazy loading, models loaded on first use)
    print("ASR service ready (models will load on first use)")

    # Initialize LLM
    await llm_service.initialize()
    print("LLM service initialized")

    yield

    # Shutdown
    print("Shutting down...")


app = FastAPI(
    title=settings.app_name,
    description="Real-time and batch ASR with SenseVoice + FunASR",
    version="0.1.0",
    lifespan=lifespan,
)

# Auth middleware (must be added before CORS)
app.add_middleware(AuthMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本地开发，允许所有来源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(transcribe.router, prefix=settings.api_prefix)
app.include_router(polish.router, prefix=settings.api_prefix)
app.include_router(outlines.router, prefix=settings.api_prefix)
app.include_router(projects.router, prefix=settings.api_prefix)
app.include_router(sessions.router, prefix=settings.api_prefix)


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "asr_loaded": asr_service._initialized,
        "llm_loaded": llm_service._initialized,
        "auth_enabled": settings.auth_enabled,
    }


@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.app_name}",
        "docs": "/docs",
        "auth_required": settings.auth_enabled,
    }
