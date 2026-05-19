"""API integration tests for session table endpoints"""
import json
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
        """Test successful single session table generation"""
        from app.services import llm_service

        async def mock_generate_table(table_structure_prompt, final_content):
            return '{"rows": [{"dimension": "姓名", "value": "张三"}]}'

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_session_table",
            mock_generate_table,
        )

        response = await client.post(f"/sessions/{sample_session['id']}/generate-table")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "table_content" in data

        # Verify table_content is valid JSON
        parsed = json.loads(data["table_content"])
        assert "rows" in parsed

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
    async def test_generate_table_no_final_content(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        sample_project: dict,
    ):
        """Test generate table when no final content"""
        from uuid import uuid4

        session_id = str(uuid4())
        session = InterviewSessionDB(
            id=session_id,
            project_id=sample_project["id"],
            filename="no_content.wav",
            audio_path="/tmp/no_content.wav",  # Required field
            duration_s=45.0,
            status="done",
            final_content="",  # Empty
        )
        test_db.add(session)
        await test_db.commit()

        response = await client.post(f"/sessions/{session_id}/generate-table")

        assert response.status_code == 400
        assert "无最终内容" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_table_no_project_prompt(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        sample_outline: dict,
    ):
        """Test generate table when project has no table structure prompt"""
        from uuid import uuid4

        # Create project without table_structure_prompt
        project_id = str(uuid4())
        project = ProjectDB(
            id=project_id,
            name="无提示词项目",
            outline_id=sample_outline["id"],
            table_structure_prompt="",  # Empty
        )
        test_db.add(project)

        session_id = str(uuid4())
        session = InterviewSessionDB(
            id=session_id,
            project_id=project_id,
            filename="test.wav",
            audio_path="/tmp/test.wav",  # Required field
            duration_s=60.0,
            status="done",
            final_content="内容",
        )
        test_db.add(session)
        await test_db.commit()

        response = await client.post(f"/sessions/{session_id}/generate-table")

        assert response.status_code == 400
        assert "未设置表格结构提示词" in response.json()["detail"]

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

        async def mock_generate_table(table_structure_prompt, final_content):
            return '{"rows": []}'

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_session_table",
            mock_generate_table,
        )

        await client.post(f"/sessions/{sample_session['id']}/generate-table")

        # Verify status changed
        result = await test_db.execute(
            select(InterviewSessionDB).where(InterviewSessionDB.id == sample_session["id"])
        )
        session = result.scalar_one()
        assert session.status == "tabled"


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
    async def test_update_table_success(
        self,
        client: AsyncClient,
        tabled_session: dict,
        test_db: AsyncSession,
    ):
        """Test successful table update"""
        new_content = '{"rows": [{"dimension": "姓名", "value": "李四"}]}'

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
    async def test_update_table_invalid_json(
        self,
        client: AsyncClient,
        tabled_session: dict,
    ):
        """Test update with invalid JSON"""
        response = await client.put(
            f"/sessions/{tabled_session['id']}/table",
            json={"table_content": "not valid json"},
        )

        assert response.status_code == 400
        assert "Invalid JSON" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_update_table_session_not_found(
        self,
        client: AsyncClient,
    ):
        """Test update with non-existent session"""
        response = await client.put(
            "/sessions/non-existent-id/table",
            json={"table_content": '{"rows": []}'},
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_table_complex_json(
        self,
        client: AsyncClient,
        tabled_session: dict,
    ):
        """Test update with complex nested JSON"""
        complex_content = json.dumps({
            "rows": [
                {"dimension": "基本信息", "value": {"name": "张三", "age": 30}},
                {"dimension": "工作", "value": ["工程师", "经理"]},
            ]
        })

        response = await client.put(
            f"/sessions/{tabled_session['id']}/table",
            json={"table_content": complex_content},
        )

        assert response.status_code == 200


class TestSessionTableJSONHandling:
    """Tests for JSON format handling in table endpoints"""

    @pytest.mark.asyncio
    async def test_generate_table_wraps_array(
        self,
        client: AsyncClient,
        sample_project: dict,
        sample_session: dict,
        monkeypatch,
    ):
        """Test that array response gets wrapped in {rows: ...}"""
        from app.services import llm_service

        async def mock_generate_table(table_structure_prompt, final_content):
            # Return array without wrapping
            return '[{"dimension": "姓名", "value": "张三"}]'

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_session_table",
            mock_generate_table,
        )

        response = await client.post(f"/sessions/{sample_session['id']}/generate-table")

        assert response.status_code == 200
        data = response.json()

        # Should be wrapped
        parsed = json.loads(data["table_content"])
        assert "rows" in parsed
        assert len(parsed["rows"]) == 1

    @pytest.mark.asyncio
    async def test_generate_table_extracts_json_from_text(
        self,
        client: AsyncClient,
        sample_project: dict,
        sample_session: dict,
        monkeypatch,
    ):
        """Test that JSON is extracted from surrounding text"""
        from app.services import llm_service

        async def mock_generate_table(table_structure_prompt, final_content):
            # Return JSON embedded in text
            return '这是表格数据：{"rows": [{"dimension": "姓名", "value": "张三"}]} 结束'

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_session_table",
            mock_generate_table,
        )

        response = await client.post(f"/sessions/{sample_session['id']}/generate-table")

        assert response.status_code == 200
        data = response.json()

        # Should extract valid JSON
        parsed = json.loads(data["table_content"])
        assert "rows" in parsed


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
        async def mock_generate_table(table_structure_prompt, final_content):
            return '{"rows": [{"dimension": "test", "value": "test"}]}'

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_session_table",
            mock_generate_table,
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
        new_content = '{"rows": [{"dimension": "updated", "value": "value"}]}'

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
