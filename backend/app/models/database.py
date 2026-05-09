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
    status = Column(String, default="pending")  # pending/transcribing/extracting/validating/done/error
    raw_transcript = Column(Text, default="")  # 原始转写文本
    extracted_info = Column(Text, default="")  # JSON 格式，根据提纲提取的结构化信息
    supplementary_info = Column(Text, default="")  # 补充遗漏信息
    final_content = Column(Text, default="")  # 最终完善内容
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Async engine with SQLite WAL mode for better concurrency
async_engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

# Enable WAL mode for SQLite
from sqlalchemy import event


@event.listens_for(async_engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    """Enable WAL mode and other optimizations for SQLite"""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=10000")
    cursor.execute("PRAGMA busy_timeout=30000")  # 30 seconds timeout
    cursor.close()

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
