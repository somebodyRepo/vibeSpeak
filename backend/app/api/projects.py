import json
import re
import zipfile
import io
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.database import OutlineDB, ProjectDB, InterviewSessionDB, get_db
from app.models.schemas import (
    OutlineContent,
    OutlineResponse,
    OutlineSection,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
    ProjectWithOutlineImport,
    SessionResponse,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/", response_model=ProjectResponse)
async def create_project(
    request: ProjectCreate,
    db: AsyncSession = Depends(get_db),
):
    """创建项目"""
    project_id = str(uuid4())

    # 如果指定了 outline_id，验证提纲是否存在
    if request.outline_id:
        result = await db.execute(
            select(OutlineDB).where(OutlineDB.id == request.outline_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Outline not found")

    project = ProjectDB(
        id=project_id,
        name=request.name,
        description=request.description or "",
        outline_id=request.outline_id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        outline_id=project.outline_id,
        session_count=0,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("/", response_model=ProjectListResponse)
async def list_projects(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """获取项目列表"""
    # 子查询获取会话数量
    session_count_subq = (
        select(
            InterviewSessionDB.project_id,
            func.count(InterviewSessionDB.id).label("count")
        )
        .group_by(InterviewSessionDB.project_id)
        .subquery()
    )

    # 主查询
    query = (
        select(ProjectDB, func.coalesce(session_count_subq.c.count, 0).label("session_count"))
        .outerjoin(session_count_subq, ProjectDB.id == session_count_subq.c.project_id)
        .order_by(desc(ProjectDB.created_at))
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(query)
    rows = result.all()

    # 获取总数
    count_result = await db.execute(select(ProjectDB))
    total = len(count_result.scalars().all())

    projects = []
    for project, session_count in rows:
        # 获取提纲信息
        outline = None
        if project.outline_id:
            outline_result = await db.execute(
                select(OutlineDB).where(OutlineDB.id == project.outline_id)
            )
            outline_db = outline_result.scalar_one_or_none()
            if outline_db:
                outline = OutlineResponse(
                    id=outline_db.id,
                    name=outline_db.name,
                    content=OutlineContent.model_validate_json(outline_db.content),
                    created_at=outline_db.created_at,
                    updated_at=outline_db.updated_at,
                )

        projects.append(ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            outline_id=project.outline_id,
            outline=outline,
            session_count=session_count,
            created_at=project.created_at,
            updated_at=project.updated_at,
        ))

    return ProjectListResponse(projects=projects, total=total)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取项目详情"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 获取会话数量
    session_result = await db.execute(
        select(func.count(InterviewSessionDB.id))
        .where(InterviewSessionDB.project_id == project_id)
    )
    session_count = session_result.scalar() or 0

    # 获取提纲信息
    outline = None
    if project.outline_id:
        outline_result = await db.execute(
            select(OutlineDB).where(OutlineDB.id == project.outline_id)
        )
        outline_db = outline_result.scalar_one_or_none()
        if outline_db:
            outline = OutlineResponse(
                id=outline_db.id,
                name=outline_db.name,
                content=OutlineContent.model_validate_json(outline_db.content),
                created_at=outline_db.created_at,
                updated_at=outline_db.updated_at,
            )

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        outline_id=project.outline_id,
        outline=outline,
        session_count=session_count,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    request: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新项目"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if request.name is not None:
        project.name = request.name

    if request.description is not None:
        project.description = request.description

    if request.outline_id is not None:
        # 验证提纲是否存在
        if request.outline_id:
            outline_result = await db.execute(
                select(OutlineDB).where(OutlineDB.id == request.outline_id)
            )
            if not outline_result.scalar_one_or_none():
                raise HTTPException(status_code=404, detail="Outline not found")
        project.outline_id = request.outline_id

    await db.commit()
    await db.refresh(project)

    # 获取会话数量
    session_result = await db.execute(
        select(func.count(InterviewSessionDB.id))
        .where(InterviewSessionDB.project_id == project_id)
    )
    session_count = session_result.scalar() or 0

    # 获取提纲信息
    outline = None
    if project.outline_id:
        outline_result = await db.execute(
            select(OutlineDB).where(OutlineDB.id == project.outline_id)
        )
        outline_db = outline_result.scalar_one_or_none()
        if outline_db:
            outline = OutlineResponse(
                id=outline_db.id,
                name=outline_db.name,
                content=OutlineContent.model_validate_json(outline_db.content),
                created_at=outline_db.created_at,
                updated_at=outline_db.updated_at,
            )

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        outline_id=project.outline_id,
        outline=outline,
        session_count=session_count,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除项目 (同时删除关联的会话)"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 删除关联的会话
    session_result = await db.execute(
        select(InterviewSessionDB).where(InterviewSessionDB.project_id == project_id)
    )
    sessions = session_result.scalars().all()
    for session in sessions:
        await db.delete(session)

    await db.delete(project)
    await db.commit()

    return {"success": True, "message": "Project and related sessions deleted"}


@router.get("/{project_id}/export")
async def export_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """导出项目所有内容"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 获取所有会话
    session_result = await db.execute(
        select(InterviewSessionDB)
        .where(InterviewSessionDB.project_id == project_id)
        .order_by(InterviewSessionDB.created_at)
    )
    sessions = session_result.scalars().all()

    # 创建 ZIP 文件
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # 添加项目信息
        project_info = {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "created_at": project.created_at.isoformat(),
            "sessions": [
                {
                    "id": s.id,
                    "filename": s.filename,
                    "status": s.status,
                    "created_at": s.created_at.isoformat(),
                }
                for s in sessions
            ],
        }
        zip_file.writestr(
            f"{project.name}/project_info.json",
            json.dumps(project_info, ensure_ascii=False, indent=2)
        )

        # 添加每个会话的内容
        for session in sessions:
            session_dir = f"{project.name}/{session.filename}"

            # 原始转写
            if session.raw_transcript:
                zip_file.writestr(
                    f"{session_dir}/transcript.txt",
                    session.raw_transcript
                )

            # 提取信息
            if session.extracted_info:
                zip_file.writestr(
                    f"{session_dir}/extracted.json",
                    session.extracted_info
                )

            # 补充信息
            if session.supplementary_info:
                zip_file.writestr(
                    f"{session_dir}/supplementary.txt",
                    session.supplementary_info
                )

            # 最终内容
            if session.final_content:
                zip_file.writestr(
                    f"{session_dir}/final.md",
                    session.final_content
                )

    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={project.name}_export.zip"
        }
    )


# ===== 合并创建项目和提纲 =====


def parse_markdown_with_title(content: str) -> tuple[str, OutlineContent]:
    """
    解析 Markdown 内容，提取标题作为项目名，其余作为提纲
    Returns: (project_name, outline_content)
    """
    lines = content.strip().split("\n")
    project_name = ""
    sections = []
    current_section = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # 匹配标题
        header_match = re.match(r"^(#{1,6})\s+(.+)$", line)
        if header_match:
            header_level = len(header_match.group(1))
            title = header_match.group(2)

            # 第一个一级标题作为项目名
            if header_level == 1 and not project_name:
                # 移除常见的后缀词
                project_name = title
                for suffix in ["提纲", "大纲", "问卷", "调研提纲", "访谈提纲"]:
                    if project_name.endswith(suffix):
                        project_name = project_name[:-len(suffix)].strip()
                        break
                continue

            # 其他标题作为板块
            if current_section:
                sections.append(current_section)

            current_section = OutlineSection(
                id=f"s{len(sections) + 1}",
                title=title,
                questions=[]
            )

        elif current_section:
            # 匹配列表项
            list_match = re.match(r"^[-*]\s+(.+)$|^\d+\.\s+(.+)$", line)
            if list_match:
                question_text = list_match.group(1) or list_match.group(2)
                current_section.questions.append(question_text)

    # 保存最后一个板块
    if current_section:
        sections.append(current_section)

    # 如果没有提取到项目名，使用默认值
    if not project_name:
        project_name = "新建项目"

    return project_name, OutlineContent(sections=sections)


@router.post("/import-with-outline", response_model=ProjectResponse)
async def import_project_with_outline(
    request: ProjectWithOutlineImport,
    db: AsyncSession = Depends(get_db),
):
    """
    同时创建项目和提纲
    - 从 Markdown 内容解析标题作为项目名
    - 其余内容作为提纲
    """
    # 解析 Markdown
    extracted_name, outline_content = parse_markdown_with_title(request.markdown_content)

    # 使用用户提供的项目名（如果有），否则使用解析出的名称
    project_name = request.project_name or extracted_name

    # 创建提纲
    outline_id = str(uuid4())
    outline = OutlineDB(
        id=outline_id,
        name=f"{project_name}提纲",
        content=outline_content.model_dump_json(),
    )
    db.add(outline)

    # 创建项目
    project_id = str(uuid4())
    project = ProjectDB(
        id=project_id,
        name=project_name,
        description=request.description or "",
        outline_id=outline_id,
    )
    db.add(project)

    await db.commit()
    await db.refresh(project)
    await db.refresh(outline)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        outline_id=project.outline_id,
        outline=OutlineResponse(
            id=outline.id,
            name=outline.name,
            content=outline_content,
            created_at=outline.created_at,
            updated_at=outline.updated_at,
        ),
        session_count=0,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )
