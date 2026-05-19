import json
from datetime import datetime
from typing import AsyncGenerator
from uuid import uuid4

from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Text, create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings

settings = get_settings()

Base = declarative_base()


class TranscriptionTaskDB(Base):
    __tablename__ = "transcription_tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    filename = Column(String, nullable=False)
    duration_s = Column(Float)
    status = Column(String, default="pending")  # pending/processing/done/error
    segments = Column(String, default="[]")  # JSON
    raw_text = Column(String, default="")
    polished = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RealtimeSessionDB(Base):
    __tablename__ = "realtime_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    transcript = Column(String, default="")
    duration_s = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


# ===== 新增: 调研项目管理模型 =====


class OutlineDB(Base):
    """调研提纲表"""
    __tablename__ = "outlines"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String, nullable=False)
    content = Column(Text, default="")  # JSON 格式结构化提纲
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProjectDB(Base):
    """调研项目表"""
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    outline_id = Column(String, ForeignKey("outlines.id"), nullable=True)
    table_structure_prompt = Column(Text, default="")  # 表格结构提示词
    summary_table = Column(Text, default="")  # 汇总 Markdown 表格
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InterviewSessionDB(Base):
    """访谈会话表"""
    __tablename__ = "interview_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    filename = Column(String, nullable=False)  # 显示名称
    audio_path = Column(String, nullable=False)  # 原始音频存储路径
    duration_s = Column(Float, default=0.0)
    status = Column(String, default="pending")  # pending/transcribing/extracting/validating/tabled/done/error
    raw_transcript = Column(Text, default="")  # 原始转写文本
    extracted_info = Column(Text, default="")  # JSON 格式，根据提纲提取的结构化信息
    supplementary_info = Column(Text, default="")  # 补充遗漏信息
    final_content = Column(Text, default="")  # 最终完善内容
    table_content = Column(Text, default="")  # JSON 格式单访谈表格数据
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Async engine with SQLite WAL mode for better concurrency
async_engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def _run_migrations(conn):
    """Run database migrations for existing tables."""
    from sqlalchemy import text

    # Check if projects table exists
    result = await conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
    ))
    if result.fetchone():
        # Add new columns to projects table if they don't exist
        for column in ['table_structure_prompt', 'summary_table']:
            try:
                await conn.execute(text(f"ALTER TABLE projects ADD COLUMN {column} TEXT DEFAULT ''"))
            except Exception:
                pass  # Column already exists

    # Check if interview_sessions table exists
    result = await conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='interview_sessions'"
    ))
    if result.fetchone():
        # Add new column to interview_sessions table if it doesn't exist
        try:
            await conn.execute(text("ALTER TABLE interview_sessions ADD COLUMN table_content TEXT DEFAULT ''"))
        except Exception:
            pass  # Column already exists


async def init_db():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Run migrations for existing tables
        await _run_migrations(conn)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
