"""API integration tests for table summary endpoints"""
import json
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import ProjectDB, InterviewSessionDB


class TestDesignTableStructure:
    """Tests for POST /projects/{project_id}/design-table-structure"""

    @pytest.mark.asyncio
    async def test_design_table_structure_success(
        self,
        client: AsyncClient,
        sample_project: dict,
        sample_session: dict,
        monkeypatch,
    ):
        """Test successful table structure design"""
        # Mock LLM service
        from app.services import llm_service

        async def mock_design_prompt(outline, final_contents):
            return "这是一个测试表格结构提示词"

        monkeypatch.setattr(llm_service.llm_service, "design_table_structure_prompt", mock_design_prompt)

        response = await client.post(f"/projects/{sample_project['id']}/design-table-structure")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "prompt" in data
        assert data["prompt"] == "这是一个测试表格结构提示词"

    @pytest.mark.asyncio
    async def test_design_table_structure_project_not_found(
        self,
        client: AsyncClient,
    ):
        """Test design with non-existent project"""
        response = await client.post("/projects/non-existent-id/design-table-structure")

        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_design_table_structure_no_outline(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
    ):
        """Test design when project has no outline"""
        from uuid import uuid4

        # Create project without outline
        project_id = str(uuid4())
        project = ProjectDB(
            id=project_id,
            name="无提纲项目",
            description="没有关联提纲",
            outline_id=None,
        )
        test_db.add(project)
        await test_db.commit()

        response = await client.post(f"/projects/{project_id}/design-table-structure")

        assert response.status_code == 400
        assert "无关联提纲" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_design_table_structure_no_completed_sessions(
        self,
        client: AsyncClient,
        sample_project: dict,
        test_db: AsyncSession,
    ):
        """Test design when no completed sessions exist"""
        # Create a pending session
        from uuid import uuid4

        session_id = str(uuid4())
        session = InterviewSessionDB(
            id=session_id,
            project_id=sample_project["id"],
            filename="pending.wav",
            audio_path="/tmp/pending.wav",  # Required field
            duration_s=30.0,
            status="pending",
        )
        test_db.add(session)
        await test_db.commit()

        response = await client.post(f"/projects/{sample_project['id']}/design-table-structure")

        assert response.status_code == 400
        assert "无已完成的访谈" in response.json()["detail"]


class TestUpdateTableStructure:
    """Tests for PUT /projects/{project_id}/table-structure"""

    @pytest.mark.asyncio
    async def test_update_table_structure_success(
        self,
        client: AsyncClient,
        sample_project: dict,
        test_db: AsyncSession,
    ):
        """Test successful table structure update"""
        prompt = "更新后的表格结构提示词"

        response = await client.put(
            f"/projects/{sample_project['id']}/table-structure",
            json={"prompt": prompt},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

        # Verify in database
        result = await test_db.execute(
            select(ProjectDB).where(ProjectDB.id == sample_project["id"])
        )
        project = result.scalar_one()
        assert project.table_structure_prompt == prompt

    @pytest.mark.asyncio
    async def test_update_table_structure_project_not_found(
        self,
        client: AsyncClient,
    ):
        """Test update with non-existent project"""
        response = await client.put(
            "/projects/non-existent-id/table-structure",
            json={"prompt": "测试提示词"},
        )

        assert response.status_code == 404


class TestGetTableStructure:
    """Tests for GET /projects/{project_id}/table-structure"""

    @pytest.mark.asyncio
    async def test_get_table_structure_success(
        self,
        client: AsyncClient,
        sample_project: dict,
    ):
        """Test successful get table structure"""
        response = await client.get(f"/projects/{sample_project['id']}/table-structure")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["prompt"] == "测试表格结构提示词"
        assert data["has_outline"] is True

    @pytest.mark.asyncio
    async def test_get_table_structure_empty(
        self,
        client: AsyncClient,
        sample_outline: dict,
        test_db: AsyncSession,
    ):
        """Test get when no table structure exists"""
        from uuid import uuid4

        project_id = str(uuid4())
        project = ProjectDB(
            id=project_id,
            name="空提示词项目",
            outline_id=sample_outline["id"],
            table_structure_prompt="",  # Empty
        )
        test_db.add(project)
        await test_db.commit()

        response = await client.get(f"/projects/{project_id}/table-structure")

        assert response.status_code == 200
        data = response.json()
        assert data["prompt"] == ""

    @pytest.mark.asyncio
    async def test_get_table_structure_project_not_found(
        self,
        client: AsyncClient,
    ):
        """Test get with non-existent project"""
        response = await client.get("/projects/non-existent-id/table-structure")

        assert response.status_code == 404


class TestGenerateAllTables:
    """Tests for POST /projects/{project_id}/generate-all-tables"""

    @pytest.mark.asyncio
    async def test_generate_all_tables_success(
        self,
        client: AsyncClient,
        sample_project: dict,
        sample_session: dict,
        monkeypatch,
    ):
        """Test successful batch generation start"""
        from app.services import batch_table_service

        # Mock batch service
        from app.services.batch_table_service import BatchGenerationProgress

        def mock_start(project_id, session_ids, table_structure_prompt, session_contents):
            return BatchGenerationProgress(
                project_id=project_id,
                total_count=len(session_ids),
                is_running=True,
            )

        monkeypatch.setattr(
            batch_table_service.batch_table_service,
            "start_batch_generation",
            mock_start,
        )

        response = await client.post(f"/projects/{sample_project['id']}/generate-all-tables")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["total_count"] >= 0

    @pytest.mark.asyncio
    async def test_generate_all_tables_no_prompt(
        self,
        client: AsyncClient,
        sample_outline: dict,
        test_db: AsyncSession,
    ):
        """Test generation when no table structure prompt"""
        from uuid import uuid4

        project_id = str(uuid4())
        project = ProjectDB(
            id=project_id,
            name="无提示词项目",
            outline_id=sample_outline["id"],
            table_structure_prompt="",  # Empty
        )
        test_db.add(project)
        await test_db.commit()

        response = await client.post(f"/projects/{project_id}/generate-all-tables")

        assert response.status_code == 400
        assert "未设置表格结构提示词" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_all_tables_no_pending_sessions(
        self,
        client: AsyncClient,
        sample_project: dict,
        tabled_session: dict,
    ):
        """Test generation when all sessions are already tabled"""
        response = await client.post(f"/projects/{sample_project['id']}/generate-all-tables")

        # Should succeed but with zero pending
        assert response.status_code == 200
        data = response.json()
        assert data["total_count"] == 0


class TestGetTableGenerationProgress:
    """Tests for GET /projects/{project_id}/table-generation-progress"""

    @pytest.mark.asyncio
    async def test_get_progress_success(
        self,
        client: AsyncClient,
        sample_project: dict,
        monkeypatch,
    ):
        """Test successful progress retrieval"""
        from app.services import batch_table_service
        from app.services.batch_table_service import BatchGenerationProgress

        # Mock progress
        mock_progress = BatchGenerationProgress(
            project_id=sample_project["id"],
            total_count=10,
            completed_count=5,
            error_count=1,
            is_running=True,
        )

        def mock_get_progress(project_id):
            return mock_progress

        monkeypatch.setattr(
            batch_table_service.batch_table_service,
            "get_progress",
            mock_get_progress,
        )

        response = await client.get(f"/projects/{sample_project['id']}/table-generation-progress")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["is_running"] is True
        assert data["total_count"] == 10
        assert data["completed_count"] == 5
        assert data["error_count"] == 1

    @pytest.mark.asyncio
    async def test_get_progress_project_not_found(
        self,
        client: AsyncClient,
    ):
        """Test progress with non-existent project"""
        response = await client.get("/projects/non-existent-id/table-generation-progress")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_progress_no_progress(
        self,
        client: AsyncClient,
        sample_project: dict,
        monkeypatch,
    ):
        """Test progress when no batch running"""
        from app.services import batch_table_service

        def mock_get_progress(project_id):
            return None

        monkeypatch.setattr(
            batch_table_service.batch_table_service,
            "get_progress",
            mock_get_progress,
        )

        response = await client.get(f"/projects/{sample_project['id']}/table-generation-progress")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["is_running"] is False
        assert data["total_count"] == 0


class TestSummarizeTables:
    """Tests for POST /projects/{project_id}/summarize-tables"""

    @pytest.mark.asyncio
    async def test_summarize_tables_success(
        self,
        client: AsyncClient,
        sample_project: dict,
        tabled_session: dict,
        monkeypatch,
    ):
        """Test successful table summarization"""
        from app.services import llm_service

        async def mock_summarize(table_structure_prompt, session_tables):
            return "| 访谈 | 姓名 | 年龄 |\n|------|------|------|\n| 访谈1 | 李四 | 25岁 |"

        monkeypatch.setattr(llm_service.llm_service, "summarize_tables", mock_summarize)

        response = await client.post(f"/projects/{sample_project['id']}/summarize-tables")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "summary_table" in data
        assert data["session_count"] >= 1

    @pytest.mark.asyncio
    async def test_summarize_tables_no_prompt(
        self,
        client: AsyncClient,
        sample_outline: dict,
        test_db: AsyncSession,
    ):
        """Test summarization without table structure prompt"""
        from uuid import uuid4

        project_id = str(uuid4())
        project = ProjectDB(
            id=project_id,
            name="无提示词项目",
            outline_id=sample_outline["id"],
            table_structure_prompt="",
        )
        test_db.add(project)
        await test_db.commit()

        response = await client.post(f"/projects/{project_id}/summarize-tables")

        assert response.status_code == 400
        assert "未设置表格结构提示词" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_summarize_tables_no_tabled_sessions(
        self,
        client: AsyncClient,
        sample_project: dict,
        sample_session: dict,  # status='done', not 'tabled'
    ):
        """Test summarization without tabled sessions"""
        response = await client.post(f"/projects/{sample_project['id']}/summarize-tables")

        assert response.status_code == 400
        assert "没有已生成表格的会话" in response.json()["detail"]


class TestGetSummaryTable:
    """Tests for GET /projects/{project_id}/summary-table"""

    @pytest.mark.asyncio
    async def test_get_summary_table_success(
        self,
        client: AsyncClient,
        sample_project: dict,
        test_db: AsyncSession,
    ):
        """Test successful summary table retrieval"""
        # Update project with summary table
        result = await test_db.execute(
            select(ProjectDB).where(ProjectDB.id == sample_project["id"])
        )
        project = result.scalar_one()
        project.summary_table = "| 访谈 | 姓名 |\n|------|------|\n| 访谈1 | 张三 |"
        await test_db.commit()

        response = await client.get(f"/projects/{sample_project['id']}/summary-table")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "summary_table" in data

    @pytest.mark.asyncio
    async def test_get_summary_table_empty(
        self,
        client: AsyncClient,
        sample_project: dict,
    ):
        """Test get when no summary table exists"""
        response = await client.get(f"/projects/{sample_project['id']}/summary-table")

        assert response.status_code == 200
        data = response.json()
        assert data["summary_table"] == ""

    @pytest.mark.asyncio
    async def test_get_summary_table_project_not_found(
        self,
        client: AsyncClient,
    ):
        """Test get with non-existent project"""
        response = await client.get("/projects/non-existent-id/summary-table")

        assert response.status_code == 404


class TestExportSummaryTable:
    """Tests for GET /projects/{project_id}/export-summary"""

    @pytest.mark.asyncio
    async def test_export_markdown_success(
        self,
        client: AsyncClient,
        sample_project: dict,
        test_db: AsyncSession,
    ):
        """Test successful markdown export"""
        summary_content = "| 访谈 | 姓名 |\n|------|------|\n| 访谈1 | 张三 |"
        result = await test_db.execute(
            select(ProjectDB).where(ProjectDB.id == sample_project["id"])
        )
        project = result.scalar_one()
        project.summary_table = summary_content
        await test_db.commit()

        response = await client.get(f"/projects/{sample_project['id']}/export-summary?format=md")

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/markdown; charset=utf-8"
        assert "attachment" in response.headers["content-disposition"]

    @pytest.mark.asyncio
    async def test_export_excel_success(
        self,
        client: AsyncClient,
        sample_project: dict,
        test_db: AsyncSession,
    ):
        """Test successful Excel export"""
        summary_content = "| 访谈 | 姓名 |\n|------|------|\n| 访谈1 | 张三 |"
        result = await test_db.execute(
            select(ProjectDB).where(ProjectDB.id == sample_project["id"])
        )
        project = result.scalar_one()
        project.summary_table = summary_content
        await test_db.commit()

        response = await client.get(f"/projects/{sample_project['id']}/export-summary?format=xlsx")

        assert response.status_code == 200
        assert "spreadsheet" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_export_no_summary(
        self,
        client: AsyncClient,
        sample_project: dict,
    ):
        """Test export when no summary table exists"""
        response = await client.get(f"/projects/{sample_project['id']}/export-summary?format=md")

        assert response.status_code == 400
        assert "尚无汇总表格" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_export_project_not_found(
        self,
        client: AsyncClient,
    ):
        """Test export with non-existent project"""
        response = await client.get("/projects/non-existent-id/export-summary?format=md")

        assert response.status_code == 404
