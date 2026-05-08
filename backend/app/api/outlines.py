import json
import re
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal, OutlineDB, get_db
from app.models.schemas import (
    OutlineContent,
    OutlineCreate,
    OutlineImport,
    OutlineListResponse,
    OutlineResponse,
    OutlineSection,
    OutlineUpdate,
)

router = APIRouter(prefix="/outlines", tags=["outlines"])


def parse_markdown_outline(content: str) -> OutlineContent:
    """将 Markdown 格式转换为结构化提纲"""
    sections = []
    current_section = None
    question_id = 0

    for line in content.split("\n"):
        line = line.strip()
        if not line:
            continue

        # 匹配标题 (# 开头)
        header_match = re.match(r"^(#{1,6})\s+(.+)$", line)
        if header_match:
            # 保存上一个板块
            if current_section:
                sections.append(current_section)

            # 创建新板块
            current_section = OutlineSection(
                id=f"s{len(sections) + 1}",
                title=header_match.group(2),
                questions=[]
            )
        elif current_section:
            # 匹配列表项 (- 或 * 或数字)
            list_match = re.match(r"^[-*]\s+(.+)$|^\d+\.\s+(.+)$", line)
            if list_match:
                question_text = list_match.group(1) or list_match.group(2)
                current_section.questions.append(question_text)

    # 保存最后一个板块
    if current_section:
        sections.append(current_section)

    return OutlineContent(sections=sections)


@router.post("/", response_model=OutlineResponse)
async def create_outline(
    request: OutlineCreate,
    db: AsyncSession = Depends(get_db),
):
    """创建提纲"""
    outline_id = str(uuid4())
    content = request.content or OutlineContent(sections=[])

    outline = OutlineDB(
        id=outline_id,
        name=request.name,
        content=content.model_dump_json(),
    )
    db.add(outline)
    await db.commit()
    await db.refresh(outline)

    return OutlineResponse(
        id=outline.id,
        name=outline.name,
        content=OutlineContent.model_validate_json(outline.content),
        created_at=outline.created_at,
        updated_at=outline.updated_at,
    )


@router.post("/import", response_model=OutlineResponse)
async def import_outline(
    request: OutlineImport,
    db: AsyncSession = Depends(get_db),
):
    """导入提纲 (支持 JSON 和 Markdown 格式)"""
    outline_id = str(uuid4())

    try:
        if request.format == "json":
            # 解析 JSON 格式
            content_dict = json.loads(request.content)
            content = OutlineContent.model_validate(content_dict)
        else:
            # 解析 Markdown 格式
            content = parse_markdown_outline(request.content)
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse outline content: {str(e)}"
        )

    outline = OutlineDB(
        id=outline_id,
        name=request.name,
        content=content.model_dump_json(),
    )
    db.add(outline)
    await db.commit()
    await db.refresh(outline)

    return OutlineResponse(
        id=outline.id,
        name=outline.name,
        content=OutlineContent.model_validate_json(outline.content),
        created_at=outline.created_at,
        updated_at=outline.updated_at,
    )


@router.get("/", response_model=OutlineListResponse)
async def list_outlines(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """获取提纲列表"""
    # 获取总数
    count_result = await db.execute(select(OutlineDB))
    total = len(count_result.scalars().all())

    # 获取分页数据
    result = await db.execute(
        select(OutlineDB)
        .order_by(desc(OutlineDB.created_at))
        .offset(offset)
        .limit(limit)
    )
    outlines = result.scalars().all()

    return OutlineListResponse(
        outlines=[
            OutlineResponse(
                id=o.id,
                name=o.name,
                content=OutlineContent.model_validate_json(o.content),
                created_at=o.created_at,
                updated_at=o.updated_at,
            )
            for o in outlines
        ],
        total=total,
    )


@router.get("/{outline_id}", response_model=OutlineResponse)
async def get_outline(
    outline_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取提纲详情"""
    result = await db.execute(
        select(OutlineDB).where(OutlineDB.id == outline_id)
    )
    outline = result.scalar_one_or_none()

    if not outline:
        raise HTTPException(status_code=404, detail="Outline not found")

    return OutlineResponse(
        id=outline.id,
        name=outline.name,
        content=OutlineContent.model_validate_json(outline.content),
        created_at=outline.created_at,
        updated_at=outline.updated_at,
    )


@router.put("/{outline_id}", response_model=OutlineResponse)
async def update_outline(
    outline_id: str,
    request: OutlineUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新提纲"""
    result = await db.execute(
        select(OutlineDB).where(OutlineDB.id == outline_id)
    )
    outline = result.scalar_one_or_none()

    if not outline:
        raise HTTPException(status_code=404, detail="Outline not found")

    if request.name is not None:
        outline.name = request.name

    if request.content is not None:
        outline.content = request.content.model_dump_json()

    await db.commit()
    await db.refresh(outline)

    return OutlineResponse(
        id=outline.id,
        name=outline.name,
        content=OutlineContent.model_validate_json(outline.content),
        created_at=outline.created_at,
        updated_at=outline.updated_at,
    )


@router.delete("/{outline_id}")
async def delete_outline(
    outline_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除提纲"""
    result = await db.execute(
        select(OutlineDB).where(OutlineDB.id == outline_id)
    )
    outline = result.scalar_one_or_none()

    if not outline:
        raise HTTPException(status_code=404, detail="Outline not found")

    await db.delete(outline)
    await db.commit()

    return {"success": True, "message": "Outline deleted"}
