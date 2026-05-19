"""API integration tests for session table endpoints"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import ProjectDB, InterviewSessionDB


class TestGenerateSessionTable:
    """Tests for POST /sessions/{session_id}/generate-table"""

    @pytest.mark.asyncio
    async def test_generate_table_success(
        self,
        client: AsyncClient,
        sample_project: dict,
        sample_session: dict,
        monkeypatch,
    ):
        """Test successful single session Markdown document generation"""
        from app.services import llm_service

        async def mock_generate_markdown(transcript, final_content):
            return "# 访谈记录\n\n## 基本信息\n访谈对象: 张三"

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_session_markdown",
            mock_generate_markdown,
        )

        response = await client.post(f"/sessions/{sample_session['id']}/generate-table")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "table_content" in data
        assert "# 访谈记录" in data["table_content"]

    @pytest.mark.asyncio
    async def test_generate_table_session_not_found(
        self,
        client: AsyncClient,
    ):
        """Test generate table with non-existent session"""
        response = await client.post("/sessions/non-existent-id/generate-table")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_generate_table_session_not_done(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        sample_project: dict,
    ):
        """Test generate table when session is not done"""
        from uuid import uuid4

        session_id = str(uuid4())
        session = InterviewSessionDB(
            id=session_id,
            project_id=sample_project["id"],
            filename="pending.wav",
            audio_path="/tmp/pending.wav",  # Required field
            duration_s=30.0,
            status="pending",  # Not done
        )
        test_db.add(session)
        await test_db.commit()

        response = await client.post(f"/sessions/{session_id}/generate-table")

        assert response.status_code == 400
        assert "尚未完成" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_table_no_transcript(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        sample_project: dict,
    ):
        """Test generate table when no transcript"""
        from uuid import uuid4

        session_id = str(uuid4())
        session = InterviewSessionDB(
            id=session_id,
            project_id=sample_project["id"],
            filename="no_content.wav",
            audio_path="/tmp/no_content.wav",  # Required field
            duration_s=45.0,
            status="done",
            raw_transcript="",  # Empty transcript
        )
        test_db.add(session)
        await test_db.commit()

        response = await client.post(f"/sessions/{session_id}/generate-table")

        assert response.status_code == 400
        assert "无转写内容" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_table_updates_status(
        self,
        client: AsyncClient,
        sample_project: dict,
        sample_session: dict,
        test_db: AsyncSession,
        monkeypatch,
    ):
        """Test that generating table updates session status to tabled"""
        from app.services import llm_service

        async def mock_generate_markdown(transcript, final_content):
            return "# 访谈记录\n\n## 基本信息\n内容"

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_session_markdown",
            mock_generate_markdown,
        )

        await client.post(f"/sessions/{sample_session['id']}/generate-table")

        # Verify status changed
        result = await test_db.execute(
            select(InterviewSessionDB).where(InterviewSessionDB.id == sample_session["id"])
        )
        session = result.scalar_one()
        assert session.status == "tabled"

    @pytest.mark.asyncio
    async def test_generate_table_llm_empty_response(
        self,
        client: AsyncClient,
        sample_project: dict,
        sample_session: dict,
        monkeypatch,
    ):
        """Test generate table when LLM returns empty response"""
        from app.services import llm_service

        async def mock_generate_markdown(transcript, final_content):
            return ""  # Empty response

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_session_markdown",
            mock_generate_markdown,
        )

        response = await client.post(f"/sessions/{sample_session['id']}/generate-table")

        assert response.status_code == 500
        assert "LLM 生成文档失败" in response.json()["detail"]


class TestGetSessionTable:
    """Tests for GET /sessions/{session_id}/table"""

    @pytest.mark.asyncio
    async def test_get_table_success(
        self,
        client: AsyncClient,
        tabled_session: dict,
    ):
        """Test successful table retrieval"""
        response = await client.get(f"/sessions/{tabled_session['id']}/table")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "table_content" in data
        assert data["status"] == "tabled"

    @pytest.mark.asyncio
    async def test_get_table_empty(
        self,
        client: AsyncClient,
        sample_session: dict,
    ):
        """Test get table when no table content"""
        response = await client.get(f"/sessions/{sample_session['id']}/table")

        assert response.status_code == 200
        data = response.json()
        assert data["table_content"] == ""

    @pytest.mark.asyncio
    async def test_get_table_session_not_found(
        self,
        client: AsyncClient,
    ):
        """Test get table with non-existent session"""
        response = await client.get("/sessions/non-existent-id/table")

        assert response.status_code == 404


class TestUpdateSessionTable:
    """Tests for PUT /sessions/{session_id}/table"""

    @pytest.mark.asyncio
    async def test_update_table_success_markdown(
        self,
        client: AsyncClient,
        tabled_session: dict,
        test_db: AsyncSession,
    ):
        """Test successful table update with Markdown content"""
        new_content = "# 访谈记录\n\n## 基本信息\n访谈对象: 李四"

        response = await client.put(
            f"/sessions/{tabled_session['id']}/table",
            json={"table_content": new_content},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

        # Verify in database
        result = await test_db.execute(
            select(InterviewSessionDB).where(InterviewSessionDB.id == tabled_session["id"])
        )
        session = result.scalar_one()
        assert session.table_content == new_content

    @pytest.mark.asyncio
    async def test_update_table_session_not_found(
        self,
        client: AsyncClient,
    ):
        """Test update with non-existent session"""
        response = await client.put(
            "/sessions/non-existent-id/table",
            json={"table_content": "# test"},
        )

        assert response.status_code == 404


class TestSessionLifecycleWithTables:
    """Tests for session lifecycle involving table generation"""

    @pytest.mark.asyncio
    async def test_session_flow_done_to_tabled(
        self,
        client: AsyncClient,
        sample_project: dict,
        sample_session: dict,
        test_db: AsyncSession,
        monkeypatch,
    ):
        """Test complete flow from done to tabled"""
        from app.services import llm_service

        # Verify initial status
        result = await test_db.execute(
            select(InterviewSessionDB).where(InterviewSessionDB.id == sample_session["id"])
        )
        session = result.scalar_one()
        assert session.status == "done"
        assert session.table_content == "" or session.table_content is None

        # Mock LLM
        async def mock_generate_markdown(transcript, final_content):
            return "# 访谈记录\n\n## 基本信息\n内容"

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_session_markdown",
            mock_generate_markdown,
        )

        # Generate table
        response = await client.post(f"/sessions/{sample_session['id']}/generate-table")
        assert response.status_code == 200

        # Verify status change
        await test_db.refresh(session)
        assert session.status == "tabled"
        assert session.table_content != ""

    @pytest.mark.asyncio
    async def test_update_preserves_tabled_status(
        self,
        client: AsyncClient,
        tabled_session: dict,
        test_db: AsyncSession,
    ):
        """Test that updating table preserves tabled status"""
        new_content = "# 更新后的内容\n\n## 信息\n更新"

        response = await client.put(
            f"/sessions/{tabled_session['id']}/table",
            json={"table_content": new_content},
        )

        assert response.status_code == 200

        # Status should remain tabled
        result = await test_db.execute(
            select(InterviewSessionDB).where(InterviewSessionDB.id == tabled_session["id"])
        )
        session = result.scalar_one()
        assert session.status == "tabled"