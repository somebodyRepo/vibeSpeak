import asyncio
from pathlib import Path
from typing import Optional

import torch
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

from app.core.config import get_settings
from app.models.schemas import TranscriptionSegment

settings = get_settings()


class ASRService:
    """ASR 服务，封装 FunASR SenseVoice + VAD"""

    _instance = None
    _lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self.model = None
        self.vad_model = None
        self._initialized = False

    async def initialize(self):
        """懒加载模型"""
        if self._initialized:
            return

        async with self._lock:
            if self._initialized:
                return

            # Determine device
            device = settings.asr_device
            if device == "auto":
                if torch.backends.mps.is_available():
                    device = "mps"
                elif torch.cuda.is_available():
                    device = "cuda"
                else:
                    device = "cpu"

            print(f"Loading ASR models on {device}...")

            # Load VAD model
            self.vad_model = AutoModel(
                model=settings.vad_model_name,
                device=device,
                disable_pbar=True,
            )

            # Load ASR model (SenseVoiceSmall)
            self.model = AutoModel(
                model=settings.asr_model_name,
                vad_model=settings.vad_model_name,
                vad_kwargs={"max_single_segment_time": 30000},
                device=device,
                disable_pbar=True,
            )

            self._initialized = True
            print("ASR models loaded successfully")

    async def transcribe_file(
        self,
        audio_path: Path,
        use_vad: bool = True,
    ) -> tuple[list[TranscriptionSegment], str]:
        """
        离线批量转写
        Returns: (segments, full_text)
        """
        await self.initialize()

        # FunASR generate
        result = self.model.generate(
            input=str(audio_path),
            batch_size_s=300,
            hotword="魔搭",
            use_itn=True,
        )

        segments = []
        full_text_parts = []

        for item in result:
            text = rich_transcription_postprocess(item.get("text", ""))
            if not text:
                continue

            # Parse timestamps if available
            timestamp = item.get("timestamp", [])
            if timestamp and len(timestamp) >= 2:
                start_ms = int(timestamp[0][0])
                end_ms = int(timestamp[-1][1])
            else:
                start_ms = 0
                end_ms = 0

            seg = TranscriptionSegment(
                text=text,
                start_ms=start_ms,
                end_ms=end_ms,
            )
            segments.append(seg)
            full_text_parts.append(text)

        full_text = "\n".join(full_text_parts)
        return segments, full_text


# Global instance
asr_service = ASRService()
