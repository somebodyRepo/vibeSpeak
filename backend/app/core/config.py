from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "vibeSpeak"
    debug: bool = False
    api_prefix: str = "/api"

    # Paths
    base_dir: Path = Path(__file__).resolve().parent.parent.parent
    models_dir: Path = base_dir / "models"
    uploads_dir: Path = base_dir / "uploads"

    # Database
    database_url: str = f"sqlite+aiosqlite:///{base_dir}/vibespeak.db"

    # ASR
    asr_model_name: str = "iic/SenseVoiceSmall"
    asr_device: str = "auto"  # auto, cpu, cuda, mps
    vad_model_name: str = "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch"

    # LLM Provider
    llm_provider: Literal["anthropic", "openai", "deepseek", "zhipu"] = "anthropic"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"
    zhipu_api_key: str = ""
    zhipu_model: str = "glm-4"

    # Audio
    sample_rate: int = 16000
    chunk_duration_ms: int = 300  # 流式 chunk 时长

    # Auth
    auth_token: str = ""  # 空表示禁用认证
    auth_enabled: bool = False  # 是否启用认证

    # Server
    host: str = "::"  # 默认监听所有 IPv6 地址
    port: int = 8000

    @field_validator("auth_enabled", mode="after")
    @classmethod
    def auto_enable_auth(cls, v: bool, info) -> bool:
        # 如果 auth_token 有值，自动启用认证
        if info.data.get("auth_token"):
            return True
        return v

    def model_post_init(self, __context) -> None:
        # Ensure directories exist
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
