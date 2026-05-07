import asyncio
import json
import subprocess
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.database import TranscriptionTaskDB, get_db
from app.models.schemas import (
    TranscriptionListResponse,
    TranscriptionResponse,
    TranscriptionResult,
    TranscriptionSegment,
    TranscriptionTask,
)
from app.services.asr_service import asr_service

router = APIRouter(prefix="/transcribe", tags=["transcribe"])
settings = get_settings()


def convert_to_wav(input_path: Path, output_path: Path) -> bool:
    """使用 ffmpeg 转换为 16kHz mono PCM wav"""
    try:
        cmd = [
            "ffmpeg",
            "-i", str(input_path),
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            "-y",
            str(output_path),
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg error: {e}")
        return False


def get_audio_duration(file_path: Path) -> float:
    """获取音频时长（秒）"""
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(file_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return float(result.stdout.strip())
    except Exception:
        return 0.0


@router.post("/upload", response_model=TranscriptionResponse)
async def upload_audio(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """上传音频文件，创建转写任务"""
    # Generate task ID
    task_id = str(uuid4())

    # Determine file extension
    original_ext = Path(file.filename).suffix.lower() if file.filename else ".wav"
    allowed_exts = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm"}

    if original_ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Allowed: {', '.join(allowed_exts)}",
        )

    # Save uploaded file
    input_path = settings.uploads_dir / f"{task_id}{original_ext}"
    wav_path = settings.uploads_dir / f"{task_id}.wav"

    content = await file.read()
    with open(input_path, "wb") as f:
        f.write(content)

    # Convert to wav if needed
    if original_ext != ".wav":
        if not convert_to_wav(input_path, wav_path):
            input_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Failed to convert audio file")
        input_path.unlink(missing_ok=True)
    else:
        wav_path = input_path

    # Get duration
    duration = get_audio_duration(wav_path)

    # Create DB record
    task_db = TranscriptionTaskDB(
        id=task_id,
        filename=file.filename,
        duration_s=duration,
        status="pending",
    )
    db.add(task_db)
    await db.commit()

    # Start transcription in background
    asyncio.create_task(process_transcription(task_id, wav_path))

    return TranscriptionResponse(
        task_id=task_id,
        status="pending",
        filename=file.filename,
    )


async def process_transcription(task_id: str, audio_path: Path):
    """后台处理转写任务"""
    from app.models.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            # Update status to processing
            result = await db.execute(
                select(TranscriptionTaskDB).where(TranscriptionTaskDB.id == task_id)
            )
            task = result.scalar_one()
            task.status = "processing"
            await db.commit()

            # Run ASR
            segments, raw_text = await asr_service.transcribe_file(audio_path)

            # Update with results
            task.status = "done"
            task.raw_text = raw_text
            task.segments = json.dumps([
                {"text": s.text, "start_ms": s.start_ms, "end_ms": s.end_ms}
                for s in segments
            ])
            await db.commit()

        except Exception as e:
            print(f"Transcription error for {task_id}: {e}")
            result = await db.execute(
                select(TranscriptionTaskDB).where(TranscriptionTaskDB.id == task_id)
            )
            task = result.scalar_one()
            task.status = "error"
            await db.commit()

        finally:
            # Cleanup temp file
            audio_path.unlink(missing_ok=True)


@router.get("/{task_id}", response_model=TranscriptionResult)
async def get_transcription(
    task_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取转写任务状态和结果"""
    result = await db.execute(
        select(TranscriptionTaskDB).where(TranscriptionTaskDB.id == task_id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Parse segments
    segments = []
    if task.segments:
        try:
            seg_data = json.loads(task.segments)
            segments = [
                TranscriptionSegment(
                    text=s["text"],
                    start_ms=s["start_ms"],
                    end_ms=s["end_ms"],
                )
                for s in seg_data
            ]
        except json.JSONDecodeError:
            pass

    return TranscriptionResult(
        id=task.id,
        filename=task.filename,
        duration_s=task.duration_s,
        status=task.status,
        segments=segments,
        raw_text=task.raw_text,
        polished=task.polished or None,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.get("/", response_model=TranscriptionListResponse)
async def list_transcriptions(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """获取转写任务列表"""
    # Get total count
    count_result = await db.execute(select(TranscriptionTaskDB))
    total = len(count_result.scalars().all())

    # Get paginated results
    result = await db.execute(
        select(TranscriptionTaskDB)
        .order_by(desc(TranscriptionTaskDB.created_at))
        .offset(offset)
        .limit(limit)
    )
    tasks = result.scalars().all()

    return TranscriptionListResponse(
        tasks=[
            TranscriptionTask(
                id=t.id,
                filename=t.filename,
                duration_s=t.duration_s,
                status=t.status,
                created_at=t.created_at,
                updated_at=t.updated_at,
            )
            for t in tasks
        ],
        total=total,
    )


@router.delete("/{task_id}")
async def delete_transcription(
    task_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除转写任务"""
    result = await db.execute(
        select(TranscriptionTaskDB).where(TranscriptionTaskDB.id == task_id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(task)
    await db.commit()

    return {"success": True, "message": "Task deleted"}
