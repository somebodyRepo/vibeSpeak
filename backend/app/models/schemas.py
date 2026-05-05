from datetime import datetime
from typing import Literal, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


# Common
class APIResponse(BaseModel):
    success: bool = True
    message: str = ""


# Transcription
class TranscriptionSegment(BaseModel):
    text: str
    start_ms: int
    end_ms: int
    speaker: Optional[str] = None


class TranscriptionTask(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    filename: str
    duration_s: Optional[float] = None
    status: Literal["pending", "processing", "done", "error"] = "pending"
    segments: list[TranscriptionSegment] = Field(default_factory=list)
    raw_text: str = ""
    polished: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class TranscriptionResponse(BaseModel):
    task_id: str
    status: str
    filename: str


class TranscriptionResult(BaseModel):
    task_id: str
    filename: str
    duration_s: Optional[float]
    status: str
    segments: list[TranscriptionSegment]
    raw_text: str
    polished: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TranscriptionListResponse(BaseModel):
    tasks: list[TranscriptionTask]
    total: int


# Realtime
class RealtimeSegment(BaseModel):
    text: str
    is_final: bool = False
    speaker: Optional[str] = None


class RealtimeSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    transcript: str = ""
    duration_s: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


# LLM Polish
class PolishRequest(BaseModel):
    text: str
    style: Literal["standard", "formal", "concise", "summary"] = "standard"
    include_summary: bool = False


class PolishResponse(BaseModel):
    original: str
    polished: str
    summary: Optional[str] = None


# WebSocket Messages
class WSMessage(BaseModel):
    type: str
    payload: dict = Field(default_factory=dict)


class WSRealtimeInit(BaseModel):
    type: Literal["init"] = "init"
    sample_rate: int = 16000


class WSAudioChunk(BaseModel):
    type: Literal["audio"] = "audio"
    data: str  # base64 encoded PCM bytes


class WSRealtimeResult(BaseModel):
    type: Literal["result"] = "result"
    text: str
    is_final: bool = False


class WSPolishRequest(BaseModel):
    type: Literal["polish"] = "polish"
    text: str
    style: str = "standard"
