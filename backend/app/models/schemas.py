from datetime import datetime
from typing import Any, Literal, Optional
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
    id: str
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


# ===== 新增: 调研项目管理 Schemas =====


# 提纲相关
class OutlineSection(BaseModel):
    """提纲板块"""
    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    title: str
    questions: list[str] = Field(default_factory=list)


class OutlineContent(BaseModel):
    """提纲内容结构"""
    sections: list[OutlineSection] = Field(default_factory=list)


class OutlineCreate(BaseModel):
    """创建提纲请求"""
    name: str
    content: Optional[OutlineContent] = None


class OutlineImport(BaseModel):
    """导入提纲请求"""
    name: str
    format: Literal["json", "markdown"] = "json"
    content: str  # 原始内容字符串


class OutlineUpdate(BaseModel):
    """更新提纲请求"""
    name: Optional[str] = None
    content: Optional[OutlineContent] = None


class OutlineResponse(BaseModel):
    """提纲响应"""
    id: str
    name: str
    content: OutlineContent
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OutlineListResponse(BaseModel):
    """提纲列表响应"""
    outlines: list[OutlineResponse]
    total: int


# 项目相关
class ProjectCreate(BaseModel):
    """创建项目请求"""
    name: str
    description: Optional[str] = None
    outline_id: Optional[str] = None


class ProjectUpdate(BaseModel):
    """更新项目请求"""
    name: Optional[str] = None
    description: Optional[str] = None
    outline_id: Optional[str] = None


class ProjectWithOutlineImport(BaseModel):
    """同时创建项目和提纲的请求"""
    project_name: Optional[str] = None  # 可选，如果不提供则从 Markdown 标题提取
    description: Optional[str] = None
    markdown_content: str  # Markdown 格式的提纲内容


class ProjectResponse(BaseModel):
    """项目响应"""
    id: str
    name: str
    description: str
    outline_id: Optional[str] = None
    outline: Optional[OutlineResponse] = None
    session_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    """项目列表响应"""
    projects: list[ProjectResponse]
    total: int


# 访谈会话相关
class SessionCreate(BaseModel):
    """创建会话请求"""
    project_id: str
    filename: Optional[str] = None


class SessionUpdate(BaseModel):
    """更新会话请求"""
    filename: Optional[str] = None
    supplementary_info: Optional[str] = None
    final_content: Optional[str] = None


class SessionResponse(BaseModel):
    """会话响应"""
    id: str
    project_id: str
    filename: str
    audio_path: str
    duration_s: float
    status: str
    raw_transcript: str
    extracted_info: dict[str, Any] = Field(default_factory=dict)
    supplementary_info: str
    final_content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SessionListResponse(BaseModel):
    """会话列表响应"""
    sessions: list[SessionResponse]
    total: int


class SessionTranscribeRequest(BaseModel):
    """转写请求"""
    pass


class SessionExtractRequest(BaseModel):
    """信息提取请求"""
    pass


class SessionValidateRequest(BaseModel):
    """验证补充请求"""
    pass


class SessionFinalizeRequest(BaseModel):
    """生成最终内容请求"""
    pass


# 导出相关
class ExportOptions(BaseModel):
    """导出选项"""
    include_audio: bool = True
    include_transcript: bool = True
    include_extracted: bool = True
    include_final: bool = True
    audio_format: Literal["wav", "mp3"] = "wav"
    transcript_format: Literal["txt", "json"] = "txt"
    extracted_format: Literal["json", "md"] = "json"
    final_format: Literal["md", "txt"] = "md"
    naming_pattern: str = "{project}_{session}_{type}_{date}"
