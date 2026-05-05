import asyncio
import base64
import io
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator, Optional

import numpy as np
import torch
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

from app.core.config import get_settings
from app.models.schemas import TranscriptionSegment

settings = get_settings()


@dataclass
class ASRStream:
    """流式 ASR 会话状态"""
    session_id: str
    cache: dict = field(default_factory=dict)
    vad_cache: dict = field(default_factory=dict)
    results: list = field(default_factory=list)
    # 累积的完整文本
    accumulated_text: str = ""
    # 当前正在识别的片段（非 final）
    current_segment_text: str = ""


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
        self._streams: dict[str, ASRStream] = {}

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

    async def create_stream(self, session_id: str) -> ASRStream:
        """创建新的流式识别会话"""
        await self.initialize()
        stream = ASRStream(session_id=session_id)
        self._streams[session_id] = stream
        return stream

    async def stream_audio_chunk(
        self,
        stream: ASRStream,
        audio_bytes: bytes,
    ) -> Optional[dict]:
        """
        喂入音频帧，返回识别状态
        音频格式: 16kHz, 16bit, mono PCM

        Returns:
            {
                "text": "累积的完整文本",
                "is_final": False,  # 当前片段是否完成
                "current_segment": "当前正在识别的片段"
            }
        """
        await self.initialize()

        # Convert bytes to numpy array
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
        audio_float = audio_array.astype(np.float32) / 32768.0

        # Accumulate audio data
        if not hasattr(stream, '_audio_buffer'):
            stream._audio_buffer = []

        stream._audio_buffer.append(audio_float)

        # Process when buffer reaches threshold (~1 second for lower latency)
        buffer_duration = len(stream._audio_buffer) * len(audio_float) / 16000
        if buffer_duration >= 1.0:
            combined = np.concatenate(stream._audio_buffer)
            stream._audio_buffer = []

            # Run inference on chunk
            result = self.model.generate(
                input=combined,
                batch_size_s=300,
                use_itn=True,
            )

            if result and result[0].get("text"):
                text = rich_transcription_postprocess(result[0]["text"])
                if text and text.strip():
                    # 追加到累积文本
                    if stream.accumulated_text:
                        stream.accumulated_text += " " + text.strip()
                    else:
                        stream.accumulated_text = text.strip()

                    stream.current_segment_text = text.strip()

                    return {
                        "text": stream.accumulated_text,
                        "is_final": False,
                        "current_segment": text.strip()
                    }

        return None

    async def close_stream(self, session_id: str):
        """关闭流式会话，返回最终结果"""
        if session_id in self._streams:
            stream = self._streams[session_id]

            # Process remaining buffer
            if hasattr(stream, '_audio_buffer') and stream._audio_buffer:
                combined = np.concatenate(stream._audio_buffer)
                result = self.model.generate(input=combined, use_itn=True)

                if result and result[0].get("text"):
                    text = rich_transcription_postprocess(result[0]["text"])
                    if text and text.strip():
                        if stream.accumulated_text:
                            stream.accumulated_text += " " + text.strip()
                        else:
                            stream.accumulated_text = text.strip()

            final_text = stream.accumulated_text
            del self._streams[session_id]
            return final_text

        return None


# Global instance
asr_service = ASRService()
