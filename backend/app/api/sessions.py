import asyncio
import json
import subprocess
import zipfile
import io
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.database import (
    AsyncSessionLocal,
    InterviewSessionDB,
    OutlineDB,
    ProjectDB,
    get_db,
)
from app.models.schemas import (
    OutlineContent,
    SessionCreate,
    SessionListResponse,
    SessionResponse,
    SessionUpdate,
)
from app.services.asr_service import asr_service
from app.services.llm_service import llm_service

router = APIRouter(prefix="/sessions", tags=["sessions"])
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


@router.post("/", response_model=SessionResponse)
async def create_session(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """创建会话 (上传音频)"""
    # 验证项目存在
    project_result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    session_id = str(uuid4())

    # 处理上传的音频文件
    original_ext = Path(file.filename).suffix.lower() if file.filename else ".wav"
    allowed_exts = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm"}

    if original_ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Allowed: {', '.join(allowed_exts)}",
        )

    # 保存原始文件
    input_path = settings.uploads_dir / f"{session_id}{original_ext}"
    wav_path = settings.uploads_dir / f"{session_id}.wav"

    content = await file.read()
    with open(input_path, "wb") as f:
        f.write(content)

    # 转换为 wav
    if original_ext != ".wav":
        if not convert_to_wav(input_path, wav_path):
            input_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Failed to convert audio file")
        input_path.unlink(missing_ok=True)
    else:
        wav_path = input_path

    # 获取时长
    duration = get_audio_duration(wav_path)

    # 创建会话记录
    session = InterviewSessionDB(
        id=session_id,
        project_id=project_id,
        filename=file.filename or f"session_{session_id}",
        audio_path=str(wav_path),
        duration_s=duration,
        status="pending",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # 自动启动处理管道
    asyncio.create_task(process_session_pipeline(session_id))

    return SessionResponse(
        id=session.id,
        project_id=session.project_id,
        filename=session.filename,
        audio_path=session.audio_path,
        duration_s=session.duration_s,
        status=session.status,
        raw_transcript=session.raw_transcript,
        extracted_info=session.extracted_info or "",
        supplementary_info=session.supplementary_info or "",
        final_content=session.final_content or "",
        table_content=session.table_content or "",
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.post("/batch-import")
async def batch_import_sessions(
    project_id: str,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """批量导入音频"""
    # 验证项目存在
    project_result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    allowed_exts = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm"}
    created_sessions = []

    for file in files:
        original_ext = Path(file.filename).suffix.lower() if file.filename else ".wav"

        if original_ext not in allowed_exts:
            continue  # 跳过不支持的格式

        session_id = str(uuid4())

        # 保存原始文件
        input_path = settings.uploads_dir / f"{session_id}{original_ext}"
        wav_path = settings.uploads_dir / f"{session_id}.wav"

        content = await file.read()
        with open(input_path, "wb") as f:
            f.write(content)

        # 转换为 wav
        if original_ext != ".wav":
            if not convert_to_wav(input_path, wav_path):
                input_path.unlink(missing_ok=True)
                continue
            input_path.unlink(missing_ok=True)
        else:
            wav_path = input_path

        duration = get_audio_duration(wav_path)

        # 创建会话记录
        session = InterviewSessionDB(
            id=session_id,
            project_id=project_id,
            filename=file.filename or f"session_{session_id}",
            audio_path=str(wav_path),
            duration_s=duration,
            status="pending",
        )
        db.add(session)
        created_sessions.append(session_id)

    await db.commit()

    # 自动启动处理管道（每个 session）
    for session_id in created_sessions:
        asyncio.create_task(process_session_pipeline(session_id))

    return {
        "success": True,
        "message": f"Created {len(created_sessions)} sessions",
        "session_ids": created_sessions,
    }


@router.get("/", response_model=SessionListResponse)
async def list_sessions(
    project_id: str,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """获取项目的会话列表"""
    # 获取总数
    count_result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.project_id == project_id)
    )
    total = len(count_result.scalars().all())

    # 获取分页数据
    result = await db.execute(
        select(InterviewSessionDB)
        .where(InterviewSessionDB.project_id == project_id)
        .order_by(desc(InterviewSessionDB.created_at))
        .offset(offset)
        .limit(limit)
    )
    sessions = result.scalars().all()

    return SessionListResponse(
        sessions=[
            SessionResponse(
                id=s.id,
                project_id=s.project_id,
                filename=s.filename,
                audio_path=s.audio_path,
                duration_s=s.duration_s,
                status=s.status,
                raw_transcript=s.raw_transcript,
                extracted_info=s.extracted_info or "",
                supplementary_info=s.supplementary_info or "",
                final_content=s.final_content or "",
                table_content=s.table_content or "",
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
            for s in sessions
        ],
        total=total,
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取会话详情"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionResponse(
        id=session.id,
        project_id=session.project_id,
        filename=session.filename,
        audio_path=session.audio_path,
        duration_s=session.duration_s,
        status=session.status,
        raw_transcript=session.raw_transcript,
        extracted_info=session.extracted_info or "",
        supplementary_info=session.supplementary_info or "",
        final_content=session.final_content or "",
        table_content=session.table_content or "",
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.put("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    request: SessionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新会话"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if request.filename is not None:
        session.filename = request.filename

    if request.supplementary_info is not None:
        session.supplementary_info = request.supplementary_info

    if request.final_content is not None:
        session.final_content = request.final_content

    await db.commit()
    await db.refresh(session)

    return SessionResponse(
        id=session.id,
        project_id=session.project_id,
        filename=session.filename,
        audio_path=session.audio_path,
        duration_s=session.duration_s,
        status=session.status,
        raw_transcript=session.raw_transcript,
        extracted_info=session.extracted_info or "",
        supplementary_info=session.supplementary_info or "",
        final_content=session.final_content or "",
        table_content=session.table_content or "",
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除会话"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # 删除音频文件
    audio_path = Path(session.audio_path)
    if audio_path.exists():
        audio_path.unlink()

    await db.delete(session)
    await db.commit()

    return {"success": True, "message": "Session deleted"}


# ===== 处理流程 API =====


async def process_session_pipeline(session_id: str):
    """
    自动处理管道：转写 → 提取信息 → 验证补充 → 生成最终内容
    上传完成后自动调用此函数，使用线程池执行阻塞操作
    """
    print(f"[Pipeline] Starting for session {session_id}")

    async with AsyncSessionLocal() as db:
        try:
            # Step 1: 转写
            print(f"[Pipeline] Step 1: Transcribing...")
            result = await db.execute(
                select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
            )
            session = result.scalar_one()
            session.status = "transcribing"
            await db.commit()

            audio_path = Path(session.audio_path)
            # 在线程池中执行阻塞的 ASR 操作
            segments, raw_text = await asyncio.to_thread(
                asr_service.transcribe_file_sync, audio_path
            )
            session.raw_transcript = raw_text
            await db.commit()
            print(f"[Pipeline] Transcription done: {len(raw_text)} chars")

            # Step 2: 提取信息
            print(f"[Pipeline] Step 2: Extracting info...")
            project_result = await db.execute(
                select(ProjectDB).where(ProjectDB.id == session.project_id)
            )
            project = project_result.scalar_one_or_none()

            if project and project.outline_id:
                outline_result = await db.execute(
                    select(OutlineDB).where(OutlineDB.id == project.outline_id)
                )
                outline_db = outline_result.scalar_one_or_none()

                if outline_db:
                    session.status = "extracting"
                    await db.commit()

                    outline_content = OutlineContent.model_validate_json(outline_db.content)
                    # 在线程池中执行阻塞的 LLM 操作，返回 Markdown
                    extracted_markdown = await asyncio.to_thread(
                        llm_service.extract_info_by_outline_sync,
                        raw_text,
                        outline_content.model_dump(),
                    )
                    session.extracted_info = extracted_markdown
                    await db.commit()
                    print(f"[Pipeline] Extraction done")

                    # Step 3: 验证补充
                    print(f"[Pipeline] Step 3: Validating...")
                    session.status = "validating"
                    await db.commit()

                    supplementary_markdown = await asyncio.to_thread(
                        llm_service.validate_extraction_sync,
                        raw_text,
                        extracted_markdown,
                        outline_content.model_dump(),
                    )

                    if supplementary_markdown:
                        session.supplementary_info = supplementary_markdown

                    await db.commit()
                    print(f"[Pipeline] Validation done")

                    # Step 4: 生成最终内容
                    print(f"[Pipeline] Step 4: Generating final content...")
                    final_content = await asyncio.to_thread(
                        llm_service.generate_final_content_sync,
                        extracted_markdown,
                        session.supplementary_info or "",
                    )
                    session.final_content = final_content
                    print(f"[Pipeline] Final content generated")

            # 完成
            session.status = "done"
            await db.commit()
            print(f"[Pipeline] Completed for session {session_id}")

        except Exception as e:
            print(f"[Pipeline] Error for session {session_id}: {e}")
            import traceback
            traceback.print_exc()
            try:
                result = await db.execute(
                    select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
                )
                session = result.scalar_one()
                session.status = "error"
                await db.commit()
            except:
                pass


async def process_transcription(session_id: str):
    """后台处理转写"""
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
            )
            session = result.scalar_one()
            session.status = "transcribing"
            await db.commit()

            # 执行转写
            audio_path = Path(session.audio_path)
            segments, raw_text = await asr_service.transcribe_file(audio_path)

            session.raw_transcript = raw_text
            session.status = "done"  # 转写完成
            await db.commit()

        except Exception as e:
            print(f"Transcription error for {session_id}: {e}")
            result = await db.execute(
                select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
            )
            session = result.scalar_one()
            session.status = "error"
            await db.commit()


@router.post("/{session_id}/transcribe")
async def transcribe_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """执行转写"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "transcribing":
        raise HTTPException(status_code=400, detail="Session is already being transcribed")

    if session.status == "done" and session.raw_transcript:
        raise HTTPException(status_code=400, detail="Session already has transcript")

    # 启动后台任务
    asyncio.create_task(process_transcription(session_id))

    return {"success": True, "message": "Transcription started", "session_id": session_id}


@router.post("/{session_id}/extract")
async def extract_session_info(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """根据提纲提取信息，返回 Markdown"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.raw_transcript:
        raise HTTPException(status_code=400, detail="Session has no transcript")

    # 获取项目的提纲
    project_result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == session.project_id)
    )
    project = project_result.scalar_one_or_none()

    if not project or not project.outline_id:
        raise HTTPException(status_code=400, detail="Project has no outline")

    outline_result = await db.execute(
        select(OutlineDB).where(OutlineDB.id == project.outline_id)
    )
    outline_db = outline_result.scalar_one_or_none()

    if not outline_db:
        raise HTTPException(status_code=400, detail="Outline not found")

    # 解析提纲
    outline_content = OutlineContent.model_validate_json(outline_db.content)

    # 更新状态
    session.status = "extracting"
    await db.commit()

    try:
        # 调用 LLM 提取信息，返回 Markdown
        extracted_markdown = await llm_service.extract_info_by_outline(
            transcript=session.raw_transcript,
            outline=outline_content.model_dump(),
        )

        session.extracted_info = extracted_markdown
        session.status = "done"
        await db.commit()

        return {
            "success": True,
            "message": "Information extracted",
            "extracted_info": extracted_markdown,
        }

    except Exception as e:
        session.status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/{session_id}/validate")
async def validate_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """验证提取信息，找出遗漏内容，返回 Markdown"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.raw_transcript or not session.extracted_info:
        raise HTTPException(status_code=400, detail="Session needs transcript and extracted info")

    # 获取提纲
    project_result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == session.project_id)
    )
    project = project_result.scalar_one_or_none()

    outline_result = await db.execute(
        select(OutlineDB).where(OutlineDB.id == project.outline_id)
    )
    outline_db = outline_result.scalar_one_or_none()

    outline_content = OutlineContent.model_validate_json(outline_db.content)

    # 更新状态
    session.status = "validating"
    await db.commit()

    try:
        # 调用 LLM 验证，返回 Markdown
        supplementary_markdown = await llm_service.validate_extraction(
            transcript=session.raw_transcript,
            extracted_markdown=session.extracted_info,
            outline=outline_content.model_dump(),
        )

        # 将补充信息保存
        if supplementary_markdown:
            session.supplementary_info = supplementary_markdown

        session.status = "done"
        await db.commit()

        return {
            "success": True,
            "message": "Validation completed",
            "supplementary_info": supplementary_markdown,
        }

    except Exception as e:
        session.status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@router.post("/{session_id}/finalize")
async def finalize_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """生成最终内容"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.extracted_info:
        raise HTTPException(status_code=400, detail="Session needs extracted info")

    try:
        # 调用 LLM 生成最终内容
        final_content = await llm_service.generate_final_content(
            extracted_markdown=session.extracted_info,
            supplementary_info=session.supplementary_info or "",
        )

        session.final_content = final_content
        await db.commit()

        return {
            "success": True,
            "message": "Final content generated",
            "final_content": final_content,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Finalization failed: {str(e)}")


# ===== 表格生成 API =====


@router.post("/{session_id}/generate-table")
async def generate_session_table(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """生成单访谈表格数据"""
    from app.services.llm_service import llm_service

    # 获取会话
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != "done":
        raise HTTPException(status_code=400, detail="会话尚未完成，无法生成表格")

    if not session.final_content:
        raise HTTPException(status_code=400, detail="会话无最终内容，无法生成表格")

    # 获取项目的表格结构提示词
    project_result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == session.project_id)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.table_structure_prompt:
        raise HTTPException(status_code=400, detail="项目未设置表格结构提示词，请先设计表格结构")

    # 调用 LLM 生成表格
    table_json = await llm_service.generate_session_table(
        table_structure_prompt=project.table_structure_prompt,
        final_content=session.final_content,
    )

    # 验证 JSON 格式
    try:
        parsed = json.loads(table_json)
        if "rows" not in parsed:
            # 尝试修复格式
            table_json = json.dumps({"rows": parsed if isinstance(parsed, list) else []})
    except json.JSONDecodeError:
        # 尝试从文本中提取 JSON
        import re
        json_match = re.search(r'\{[\s\S]*\}', table_json)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                if "rows" not in parsed:
                    table_json = json.dumps({"rows": parsed if isinstance(parsed, list) else []})
                else:
                    table_json = json_match.group()
            except json.JSONDecodeError:
                raise HTTPException(status_code=500, detail="LLM 生成的数据格式无效")
        else:
            raise HTTPException(status_code=500, detail="LLM 生成的数据格式无效")

    # 保存表格数据
    session.table_content = table_json
    session.status = "tabled"
    await db.commit()

    return {
        "success": True,
        "message": "表格生成成功",
        "table_content": table_json,
    }


@router.get("/{session_id}/table")
async def get_session_table(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取会话表格数据"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "success": True,
        "table_content": session.table_content or "",
        "status": session.status,
    }


class TableContentUpdate(BaseModel):
    table_content: str


@router.put("/{session_id}/table")
async def update_session_table(
    session_id: str,
    request: TableContentUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新会话表格数据"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Validate JSON format
    try:
        json.loads(request.table_content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")

    session.table_content = request.table_content
    await db.commit()

    return {
        "success": True,
        "message": "表格数据更新成功",
        "table_content": session.table_content,
    }


# ===== 导出 API =====


@router.get("/{session_id}/export/audio")
async def export_audio(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """导出音频"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    audio_path = Path(session.audio_path)
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    # RFC 5987 encoding for non-ASCII filenames
    filename = f"{session.filename}.wav"
    encoded_filename = quote(filename)

    return StreamingResponse(
        open(audio_path, "rb"),
        media_type="audio/wav",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.get("/{session_id}/export/transcript")
async def export_transcript(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """导出转写文本"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.raw_transcript:
        raise HTTPException(status_code=400, detail="No transcript available")

    # RFC 5987 encoding for non-ASCII filenames
    filename = f"{session.filename}_transcript.txt"
    encoded_filename = quote(filename)

    return StreamingResponse(
        iter([session.raw_transcript.encode()]),
        media_type="text/plain",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.get("/{session_id}/export/extracted")
async def export_extracted(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """导出提取信息（Markdown 格式）"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.extracted_info:
        raise HTTPException(status_code=400, detail="No extracted info available")

    # RFC 5987 encoding for non-ASCII filenames
    filename = f"{session.filename}_extracted.md"
    encoded_filename = quote(filename)

    return StreamingResponse(
        iter([session.extracted_info.encode()]),
        media_type="text/markdown",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.get("/{session_id}/export/final")
async def export_final(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """导出最终内容"""
    result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.final_content:
        raise HTTPException(status_code=400, detail="No final content available")

    # RFC 5987 encoding for non-ASCII filenames
    filename = f"{session.filename}_final.md"
    encoded_filename = quote(filename)

    return StreamingResponse(
        iter([session.final_content.encode()]),
        media_type="text/markdown",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )
