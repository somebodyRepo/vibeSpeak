import json
import re
import zipfile
import io
from datetime import datetime
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
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
    StructurePromptUpdate,
    StructurePromptResponse,
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
        table_structure_prompt=project.table_structure_prompt or "",
        summary_table=project.summary_table or "",
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
            table_structure_prompt=project.table_structure_prompt or "",
            summary_table=project.summary_table or "",
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
        table_structure_prompt=project.table_structure_prompt or "",
        summary_table=project.summary_table or "",
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

    if request.table_structure_prompt is not None:
        project.table_structure_prompt = request.table_structure_prompt

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
        table_structure_prompt=project.table_structure_prompt or "",
        summary_table=project.summary_table or "",
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


# ===== 批量表格生成 API =====


@router.post("/{project_id}/generate-all-tables")
async def generate_all_tables(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """触发批量生成所有访谈的 Markdown 结构化文档"""
    from app.services.batch_table_service import batch_table_service

    # 获取项目
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 获取需要生成文档的会话（done状态且未生成文档）
    session_result = await db.execute(
        select(InterviewSessionDB)
        .where(InterviewSessionDB.project_id == project_id)
        .where(InterviewSessionDB.status == "done")
        .where(InterviewSessionDB.raw_transcript != "")
        .where(InterviewSessionDB.table_content == "")
    )
    sessions = session_result.scalars().all()

    if not sessions:
        return {
            "success": True,
            "message": "没有需要生成文档的会话",
            "total_count": 0,
            "pending_count": 0,
        }

    # 准备会话数据
    session_data = {
        s.id: {
            "transcript": s.raw_transcript or "",
            "final_content": s.final_content or "",
        }
        for s in sessions
    }
    session_ids = [s.id for s in sessions]

    # 使用项目的自定义提示词模板（如存在）
    prompt_template = project.table_structure_prompt or None

    # 启动批量生成
    progress = batch_table_service.start_batch_generation(
        project_id=project_id,
        session_ids=session_ids,
        session_data=session_data,
        prompt_template=prompt_template,
    )

    return {
        "success": True,
        "message": f"开始批量生成 {len(sessions)} 个文档",
        "total_count": progress.total_count,
        "pending_count": progress.total_count - progress.completed_count - progress.error_count,
    }


@router.get("/{project_id}/table-generation-progress")
async def get_table_generation_progress(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取批量表格生成进度"""
    from app.services.batch_table_service import batch_table_service

    # 验证项目存在
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    progress = batch_table_service.get_progress(project_id)

    if not progress:
        # 返回默认进度
        return {
            "success": True,
            "is_running": False,
            "total_count": 0,
            "completed_count": 0,
            "error_count": 0,
            "tasks": [],
        }

    # 构建任务状态列表
    tasks = []
    for session_id, task in progress.tasks.items():
        tasks.append({
            "session_id": session_id,
            "status": task.status,
            "error_message": task.error_message,
            "retry_count": task.retry_count,
        })

    return {
        "success": True,
        "is_running": progress.is_running,
        "total_count": progress.total_count,
        "completed_count": progress.completed_count,
        "error_count": progress.error_count,
        "tasks": tasks,
    }


# ===== 表格整合汇总 API =====


@router.post("/{project_id}/summarize-tables")
async def summarize_tables(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """触发整合所有已生成文档的会话，生成多维度汇总报告"""
    from app.services.llm_service import llm_service

    # 获取项目
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 检查是否有自定义提示词模板
    if not project.table_structure_prompt:
        raise HTTPException(status_code=400, detail="尚未设置提示词模板，请先生成或保存模板")

    # 获取所有 tabled 状态的会话（已生成 Markdown 文档）
    session_result = await db.execute(
        select(InterviewSessionDB)
        .where(InterviewSessionDB.project_id == project_id)
        .where(InterviewSessionDB.status == "tabled")
        .where(InterviewSessionDB.table_content != "")
    )
    sessions = session_result.scalars().all()

    if not sessions:
        raise HTTPException(status_code=400, detail="没有已生成文档的会话，请先生成文档")

    # 收集各会话的 Markdown 文档
    session_docs = [s.table_content for s in sessions if s.table_content]

    if not session_docs:
        raise HTTPException(status_code=400, detail="没有有效的文档数据")

    # 调用 LLM 按结构整合汇总
    summary_markdown = await llm_service.summarize_by_structure(
        session_docs=session_docs,
        structure_prompt=project.table_structure_prompt,
    )

    if not summary_markdown:
        raise HTTPException(status_code=500, detail="LLM生成汇总报告失败")

    # 保存汇总报告
    project.summary_table = summary_markdown
    await db.commit()

    return {
        "success": True,
        "message": f"成功整合 {len(sessions)} 个访谈的文档",
        "summary_table": summary_markdown,
        "session_count": len(sessions),
    }


@router.get("/{project_id}/summary-table")
async def get_summary_table(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取项目的汇总表格"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "success": True,
        "summary_table": project.summary_table or "",
    }


# ===== 提示词模板 API =====


@router.post("/{project_id}/generate-structure-prompt", response_model=StructurePromptResponse)
async def generate_structure_prompt(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """调用LLM生成提示词模板"""
    from app.services.llm_service import llm_service

    # 获取项目
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 获取提纲
    if not project.outline_id:
        raise HTTPException(status_code=400, detail="项目没有关联提纲，请先关联提纲")

    outline_result = await db.execute(
        select(OutlineDB).where(OutlineDB.id == project.outline_id)
    )
    outline_db = outline_result.scalar_one_or_none()

    if not outline_db:
        raise HTTPException(status_code=404, detail="提纲不存在")

    # 解析提纲内容
    outline_content = json.loads(outline_db.content)

    # 获取已完成的访谈作为样本
    session_result = await db.execute(
        select(InterviewSessionDB)
        .where(InterviewSessionDB.project_id == project_id)
        .where(InterviewSessionDB.status == "done")
        .where(InterviewSessionDB.raw_transcript != "")
        .limit(3)
    )
    sessions = session_result.scalars().all()

    # 收集样本转写文本
    sample_transcripts = [s.raw_transcript for s in sessions if s.raw_transcript]

    # 调用LLM生成提示词
    prompt = await llm_service.generate_structure_prompt(
        outline=outline_content,
        sample_transcripts=sample_transcripts,
    )

    if not prompt:
        raise HTTPException(status_code=500, detail="LLM生成提示词失败")

    # 保存提示词到项目
    project.table_structure_prompt = prompt
    await db.commit()

    return StructurePromptResponse(
        success=True,
        table_structure_prompt=prompt,
    )


@router.get("/{project_id}/structure-prompt", response_model=StructurePromptResponse)
async def get_structure_prompt(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取已保存的提示词模板"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return StructurePromptResponse(
        success=True,
        table_structure_prompt=project.table_structure_prompt or "",
    )


@router.put("/{project_id}/structure-prompt", response_model=StructurePromptResponse)
async def update_structure_prompt(
    project_id: str,
    request: StructurePromptUpdate,
    db: AsyncSession = Depends(get_db),
):
    """保存提示词模板"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.table_structure_prompt = request.table_structure_prompt
    await db.commit()

    return StructurePromptResponse(
        success=True,
        table_structure_prompt=request.table_structure_prompt,
    )


@router.get("/{project_id}/export-summary")
async def export_summary_table(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """导出汇总报告（Markdown格式）"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.summary_table:
        raise HTTPException(status_code=400, detail="项目尚无汇总报告，请先生成汇总报告")

    # Generate filename
    date_str = datetime.now().strftime("%Y%m%d")
    safe_name = re.sub(r'[^\w一-鿿]', '_', project.name)
    filename = f"{safe_name}_汇总报告_{date_str}.md"
    encoded_filename = quote(filename)

    return StreamingResponse(
        iter([project.summary_table.encode()]),
        media_type="text/markdown",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


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
        table_structure_prompt=project.table_structure_prompt or "",
        summary_table=project.summary_table or "",
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
