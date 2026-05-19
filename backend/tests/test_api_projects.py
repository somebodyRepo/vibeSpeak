"""API integration tests for table summary endpoints"""
import json
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import ProjectDB, InterviewSessionDB


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

        def mock_start(project_id, session_ids, session_data):
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

        async def mock_summarize(session_docs):
            return "| 访谈 | 姓名 | 年龄 |\n|------|------|------|\n| 访谈1 | 李四 | 25岁 |"

        monkeypatch.setattr(llm_service.llm_service, "summarize_tables", mock_summarize)

        response = await client.post(f"/projects/{sample_project['id']}/summarize-tables")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "summary_table" in data
        assert data["session_count"] >= 1

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
        assert "没有已生成文档的会话" in response.json()["detail"]


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
