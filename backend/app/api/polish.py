from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import TranscriptionTaskDB, get_db
from app.models.schemas import PolishRequest, PolishResponse
from app.services.llm_service import llm_service

router = APIRouter(prefix="/polish", tags=["polish"])


@router.post("/", response_model=PolishResponse)
async def polish_text(
    request: PolishRequest,
):
    """文本润色（非流式）"""
    try:
        polished, summary = await llm_service.polish_batch(
            text=request.text,
            style=request.style,
            include_summary=request.include_summary,
        )
        return PolishResponse(
            original=request.text,
            polished=polished,
            summary=summary,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Polish failed: {str(e)}")


@router.post("/stream")
async def polish_text_stream(
    request: PolishRequest,
):
    """文本润色（流式 SSE）"""
    async def generate():
        async for chunk in llm_service.polish_stream(
            text=request.text,
            style=request.style,
        ):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
    )


@router.post("/task/{task_id}", response_model=PolishResponse)
async def polish_task_transcript(
    task_id: str,
    style: str = "standard",
    include_summary: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """润色已存在的转写任务文本"""
    result = await db.execute(
        select(TranscriptionTaskDB).where(TranscriptionTaskDB.id == task_id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not task.raw_text:
        raise HTTPException(status_code=400, detail="Task has no transcript")

    try:
        polished, summary = await llm_service.polish_batch(
            text=task.raw_text,
            style=style,
            include_summary=include_summary,
        )

        # Save polished result
        task.polished = polished
        await db.commit()

        return PolishResponse(
            original=task.raw_text,
            polished=polished,
            summary=summary,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Polish failed: {str(e)}")
