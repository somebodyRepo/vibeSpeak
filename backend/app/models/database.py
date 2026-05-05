import json
from datetime import datetime
from typing import AsyncGenerator
from uuid import uuid4

from sqlalchemy import Column, DateTime, Float, String, create_engine
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


# Async engine
async_engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
)

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
