"""Tests for structure prompt API endpoints"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import sys


class TestGenerateStructurePrompt:
    """Tests for POST /projects/{project_id}/generate-structure-prompt"""

    @pytest.mark.asyncio
    async def test_generate_prompt_success(self, client, sample_project, sample_session, monkeypatch):
        """Test successful prompt generation"""
        mock_prompt = "# 多维度访谈汇总报告生成提示词\n\n## 维度说明\n### 维度1: 基本信息\n**描述**: 访谈对象的基本信息\n**表格列**: | 姓名 | 年龄 | 职业 |"

        from app.services import llm_service

        async def mock_generate(*args, **kwargs):
            return mock_prompt

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_structure_prompt",
            mock_generate
        )

        response = await client.post(f"/projects/{sample_project['id']}/generate-structure-prompt")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "多维度" in data["table_structure_prompt"]

    @pytest.mark.asyncio
    async def test_generate_prompt_project_not_found(self, client):
        """Test with non-existent project"""
        response = await client.post("/projects/non-existent-id/generate-structure-prompt")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_generate_prompt_no_outline(self, client, test_db):
        """Test project without outline"""
        from app.models.database import ProjectDB
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

        response = await client.post(f"/projects/{project_id}/generate-structure-prompt")

        assert response.status_code == 400
        assert "提纲" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_prompt_llm_failure(self, client, sample_project, monkeypatch):
        """Test LLM failure"""
        from app.services import llm_service

        async def mock_generate(*args, **kwargs):
            return ""

        monkeypatch.setattr(
            llm_service.llm_service,
            "generate_structure_prompt",
            mock_generate
        )

        response = await client.post(f"/projects/{sample_project['id']}/generate-structure-prompt")

        assert response.status_code == 500
        assert "失败" in response.json()["detail"]


class TestGetStructurePrompt:
    """Tests for GET /projects/{project_id}/structure-prompt"""

    @pytest.mark.asyncio
    async def test_get_prompt_success(self, client, sample_project):
        """Test getting existing prompt"""
        response = await client.get(f"/projects/{sample_project['id']}/structure-prompt")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "table_structure_prompt" in data

    @pytest.mark.asyncio
    async def test_get_prompt_empty(self, client, test_db):
        """Test project without prompt"""
        from app.models.database import ProjectDB
        from uuid import uuid4

        # Create project without prompt
        project_id = str(uuid4())
        project = ProjectDB(
            id=project_id,
            name="无提示词项目",
            description="测试",
            table_structure_prompt="",
        )
        test_db.add(project)
        await test_db.commit()

        response = await client.get(f"/projects/{project_id}/structure-prompt")

        assert response.status_code == 200
        data = response.json()
        assert data["table_structure_prompt"] == ""

    @pytest.mark.asyncio
    async def test_get_prompt_project_not_found(self, client):
        """Test with non-existent project"""
        response = await client.get("/projects/non-existent-id/structure-prompt")

        assert response.status_code == 404


class TestUpdateStructurePrompt:
    """Tests for PUT /projects/{project_id}/structure-prompt"""

    @pytest.mark.asyncio
    async def test_update_prompt_success(self, client, sample_project):
        """Test updating prompt"""
        new_prompt = "# 新的提示词模板\n\n## 维度1: 测试维度"

        response = await client.put(
            f"/projects/{sample_project['id']}/structure-prompt",
            json={"table_structure_prompt": new_prompt}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["table_structure_prompt"] == new_prompt

    @pytest.mark.asyncio
    async def test_update_prompt_project_not_found(self, client):
        """Test with non-existent project"""
        response = await client.put(
            "/projects/non-existent-id/structure-prompt",
            json={"table_structure_prompt": "test"}
        )

        assert response.status_code == 404


class TestLLMServiceGenerateStructurePrompt:
    """Tests for LLMService.generate_structure_prompt method"""

    @pytest.mark.asyncio
    async def test_generate_structure_prompt_method(self):
        """Test the LLM method directly"""
        from app.services.llm_service import LLMService, llm_service

        # Use the global instance and mock the client
        llm_service._initialized = True
        llm_service.model = "gpt-4o"  # Need to set model attribute
        llm_service.client = AsyncMock()
        llm_service.client.chat.completions.create = AsyncMock(
            return_value=MagicMock(
                choices=[MagicMock(message=MagicMock(content="# 测试提示词"))]
            )
        )

        outline = {
            "sections": [
                {"id": "s1", "title": "基本信息", "questions": ["姓名", "年龄"]},
            ]
        }
        transcripts = ["访谈记录样本内容"]

        result = await llm_service.generate_structure_prompt(
            outline=outline,
            sample_transcripts=transcripts,
        )

        assert result == "# 测试提示词"


class TestPromptTemplateFormat:
    """Tests for prompt template formatting"""

    def test_generate_structure_prompt_template_format(self):
        """Test template can be formatted without errors"""
        from app.services.llm_service import LLMService

        template = LLMService.GENERATE_STRUCTURE_PROMPT_TEMPLATE

        # Test that format works with valid inputs
        outline_json = '{"sections": [{"title": "测试"}]}'
        sample_transcripts = "样本内容"

        formatted = template.format(
            outline_json=outline_json,
            sample_transcripts=sample_transcripts,
        )

        assert outline_json in formatted
        assert sample_transcripts in formatted
