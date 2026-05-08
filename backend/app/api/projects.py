import json
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
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
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
