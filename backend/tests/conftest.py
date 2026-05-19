"""Test configuration and fixtures for vibeSpeak backend tests"""
import asyncio
import os
import sys
import tempfile
from typing import AsyncGenerator, Generator
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

# Mock heavy dependencies before importing app
mock_torch = MagicMock()
mock_torch.cuda.is_available.return_value = False
sys.modules["torch"] = mock_torch
sys.modules["torchaudio"] = MagicMock()

# Mock funasr with proper package structure
mock_funasr = MagicMock()
mock_funasr.utils = MagicMock()
mock_funasr.utils.postprocess_utils = MagicMock()
mock_funasr.utils.postprocess_utils.rich_transcription_postprocess = MagicMock()
sys.modules["funasr"] = mock_funasr
sys.modules["funasr.utils"] = mock_funasr.utils
sys.modules["funasr.utils.postprocess_utils"] = mock_funasr.utils.postprocess_utils

from app.main import app
from app.models.database import Base, get_db


# Use a temporary file for test database
@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """Create a fresh test database for each test"""
    # Create temporary database file
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    database_url = f"sqlite+aiosqlite:///{db_path}"

    engine = create_async_engine(database_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        yield session

    # Cleanup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()
    os.close(db_fd)
    os.unlink(db_path)


@pytest_asyncio.fixture(scope="function")
async def client(test_db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create test client with database dependency override"""
    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def sample_outline(test_db: AsyncSession) -> dict:
    """Create a sample outline for testing"""
    from app.models.database import OutlineDB
    from app.models.schemas import OutlineContent, OutlineSection
    from uuid import uuid4

    outline_id = str(uuid4())
    outline_content = OutlineContent(sections=[
        OutlineSection(id="s1", title="基本信息", questions=["姓名", "年龄", "职业"]),
        OutlineSection(id="s2", title="工作情况", questions=["工作内容", "工作满意度"]),
    ])

    outline = OutlineDB(
        id=outline_id,
        name="测试提纲",
        content=outline_content.model_dump_json(),
    )
    test_db.add(outline)
    await test_db.commit()
    await test_db.refresh(outline)

    return {"id": outline_id, "name": "测试提纲", "content": outline_content.model_dump()}


@pytest_asyncio.fixture
async def sample_project(test_db: AsyncSession, sample_outline: dict) -> dict:
    """Create a sample project for testing"""
    from app.models.database import ProjectDB
    from uuid import uuid4

    project_id = str(uuid4())
    project = ProjectDB(
        id=project_id,
        name="测试项目",
        description="这是一个测试项目",
        outline_id=sample_outline["id"],
        table_structure_prompt="测试表格结构提示词",
        summary_table="",
    )
    test_db.add(project)
    await test_db.commit()
    await test_db.refresh(project)

    return {
        "id": project_id,
        "name": "测试项目",
        "description": "这是一个测试项目",
        "outline_id": sample_outline["id"],
    }


@pytest_asyncio.fixture
async def sample_session(test_db: AsyncSession, sample_project: dict) -> dict:
    """Create a sample session for testing"""
    from app.models.database import InterviewSessionDB
    from uuid import uuid4

    session_id = str(uuid4())
    session = InterviewSessionDB(
        id=session_id,
        project_id=sample_project["id"],
        filename="test_audio.wav",
        audio_path="/tmp/test_audio.wav",  # Required field
        duration_s=60.0,
        status="done",
        raw_transcript="这是测试转写文本",
        final_content="## 基本信息\n**姓名**: 张三\n**年龄**: 30岁\n**职业**: 工程师\n\n## 工作情况\n**工作内容**: 软件开发\n**工作满意度**: 比较满意",
    )
    test_db.add(session)
    await test_db.commit()
    await test_db.refresh(session)

    return {
        "id": session_id,
        "project_id": sample_project["id"],
        "filename": "test_audio.wav",
        "status": "done",
    }


@pytest_asyncio.fixture
async def tabled_session(test_db: AsyncSession, sample_project: dict) -> dict:
    """Create a session with Markdown table content for testing"""
    from app.models.database import InterviewSessionDB
    from uuid import uuid4

    session_id = str(uuid4())
    session = InterviewSessionDB(
        id=session_id,
        project_id=sample_project["id"],
        filename="tabled_audio.wav",
        audio_path="/tmp/tabled_audio.wav",  # Required field
        duration_s=45.0,
        status="tabled",
        raw_transcript="这是已生成表格的转写文本",
        final_content="## 基本信息\n**姓名**: 李四\n**年龄**: 25岁",
        table_content="# 访谈记录\n\n## 基本信息\n访谈对象: 李四\n\n## 核心发现\n- 年龄: 25岁\n- 职业: 设计师",
    )
    test_db.add(session)
    await test_db.commit()
    await test_db.refresh(session)

    return {
        "id": session_id,
        "project_id": sample_project["id"],
        "filename": "tabled_audio.wav",
        "status": "tabled",
    }
