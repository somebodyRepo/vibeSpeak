"""Unit tests for LLM service table-related methods"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json

from app.services.llm_service import LLMService, llm_service


class TestDesignTableStructurePrompt:
    """Tests for design_table_structure_prompt method"""

    @pytest.mark.asyncio
    async def test_design_prompt_success(self):
        """Test successful prompt generation"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "表格结构提示词内容"

        service.client.chat.completions.create = AsyncMock(return_value=mock_response)

        outline = {
            "sections": [
                {"id": "s1", "title": "基本信息", "questions": ["姓名", "年龄"]}
            ]
        }
        final_contents = ["访谈内容1", "访谈内容2"]

        result = await service.design_table_structure_prompt(
            outline=outline,
            final_contents=final_contents,
        )

        assert result == "表格结构提示词内容"
        service.client.chat.completions.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_design_prompt_limits_contents(self):
        """Test that design limits to 5 final contents"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "提示词"
        service.client.chat.completions.create = AsyncMock(return_value=mock_response)

        outline = {"sections": []}
        # 7 contents, should only use 5
        final_contents = [f"内容{i}" for i in range(7)]

        await service.design_table_structure_prompt(
            outline=outline,
            final_contents=final_contents,
        )

        # Check that prompt was built correctly (5 contents)
        call_args = service.client.chat.completions.create.call_args
        messages = call_args.kwargs["messages"]
        system_prompt = messages[0]["content"]

        # Should contain separator between contents
        assert "---" in system_prompt

    @pytest.mark.asyncio
    async def test_design_prompt_no_client(self):
        """Test design when client not initialized"""
        service = LLMService()
        service._initialized = True
        service.client = None

        result = await service.design_table_structure_prompt(
            outline={},
            final_contents=[],
        )

        assert result == ""


class TestGenerateSessionTable:
    """Tests for generate_session_table method"""

    @pytest.mark.asyncio
    async def test_generate_table_success(self):
        """Test successful table generation"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        expected_json = '{"rows": [{"dimension": "姓名", "value": "张三"}]}'
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = expected_json

        service.client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await service.generate_session_table(
            table_structure_prompt="测试提示词",
            final_content="访谈内容",
        )

        assert result == expected_json

    @pytest.mark.asyncio
    async def test_generate_table_empty_response(self):
        """Test table generation with empty response"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = None

        service.client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await service.generate_session_table(
            table_structure_prompt="测试提示词",
            final_content="访谈内容",
        )

        assert result == ""

    @pytest.mark.asyncio
    async def test_generate_table_error_handling(self):
        """Test table generation error handling"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        service.client.chat.completions.create = AsyncMock(
            side_effect=Exception("API error")
        )

        result = await service.generate_session_table(
            table_structure_prompt="测试提示词",
            final_content="访谈内容",
        )

        assert result == ""


class TestSummarizeTables:
    """Tests for summarize_tables method"""

    @pytest.mark.asyncio
    async def test_summarize_success(self):
        """Test successful table summarization"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        expected_markdown = "| 访谈 | 姓名 |\n|------|------|\n| 访谈1 | 张三 |"
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = expected_markdown

        service.client.chat.completions.create = AsyncMock(return_value=mock_response)

        session_tables = [
            {"rows": [{"dimension": "姓名", "value": "张三"}]},
            {"rows": [{"dimension": "姓名", "value": "李四"}]},
        ]

        result = await service.summarize_tables(
            table_structure_prompt="测试提示词",
            session_tables=session_tables,
        )

        assert result == expected_markdown

    @pytest.mark.asyncio
    async def test_summarize_formats_tables(self):
        """Test that summarize properly formats input tables"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "汇总表格"

        service.client.chat.completions.create = AsyncMock(return_value=mock_response)

        session_tables = [
            {"rows": [{"dimension": "姓名", "value": "张三"}]},
        ]

        await service.summarize_tables(
            table_structure_prompt="测试提示词",
            session_tables=session_tables,
        )

        # Check that the prompt contains formatted JSON
        call_args = service.client.chat.completions.create.call_args
        system_prompt = call_args.kwargs["messages"][0]["content"]

        assert "访谈 1" in system_prompt
        assert "```json" in system_prompt

    @pytest.mark.asyncio
    async def test_summarize_no_client(self):
        """Test summarize when client not initialized"""
        service = LLMService()
        service._initialized = True
        service.client = None

        result = await service.summarize_tables(
            table_structure_prompt="测试",
            session_tables=[],
        )

        assert result == ""


class TestSyncMethods:
    """Tests for sync versions of methods"""

    def test_design_table_structure_prompt_sync(self):
        """Test sync version of design prompt"""
        service = LLMService()
        service._sync_initialized = True
        service._sync_client = MagicMock()
        service.model = "test-model"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "同步提示词"

        service._sync_client.chat.completions.create = MagicMock(return_value=mock_response)

        result = service.design_table_structure_prompt_sync(
            outline={},
            final_contents=["内容"],
        )

        assert result == "同步提示词"

    def test_generate_session_table_sync(self):
        """Test sync version of table generation"""
        service = LLMService()
        service._sync_initialized = True
        service._sync_client = MagicMock()
        service.model = "test-model"

        expected_json = '{"rows": []}'
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = expected_json

        service._sync_client.chat.completions.create = MagicMock(return_value=mock_response)

        result = service.generate_session_table_sync(
            table_structure_prompt="测试",
            final_content="内容",
        )

        assert result == expected_json

    def test_summarize_tables_sync(self):
        """Test sync version of summarization"""
        service = LLMService()
        service._sync_initialized = True
        service._sync_client = MagicMock()
        service.model = "test-model"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "| 访谈 | 姓名 |"

        service._sync_client.chat.completions.create = MagicMock(return_value=mock_response)

        result = service.summarize_tables_sync(
            table_structure_prompt="测试",
            session_tables=[{"rows": []}],
        )

        assert result == "| 访谈 | 姓名 |"

    def test_sync_methods_without_client(self):
        """Test sync methods when client not available"""
        service = LLMService()
        service._sync_initialized = True
        service._sync_client = None

        result1 = service.design_table_structure_prompt_sync(outline={}, final_contents=[])
        result2 = service.generate_session_table_sync(table_structure_prompt="", final_content="")
        result3 = service.summarize_tables_sync(table_structure_prompt="", session_tables=[])

        assert result1 == ""
        assert result2 == ""
        assert result3 == ""


class TestPromptTemplates:
    """Tests for prompt template correctness"""

    def test_design_prompt_template_format(self):
        """Test that design prompt template has correct placeholders"""
        template = LLMService.DESIGN_TABLE_STRUCTURE_PROMPT

        assert "{outline_json}" in template
        assert "{final_contents}" in template
        assert "表格结构提示词" in template
        assert "维度" in template

    def test_generate_table_prompt_template_format(self):
        """Test that generate table prompt template has correct placeholders"""
        template = LLMService.GENERATE_SESSION_TABLE_PROMPT

        assert "{table_structure_prompt}" in template
        assert "{final_content}" in template
        assert "JSON" in template
        assert "rows" in template

    def test_summarize_prompt_template_format(self):
        """Test that summarize prompt template has correct placeholders"""
        template = LLMService.SUMMARIZE_TABLES_PROMPT

        assert "{table_structure_prompt}" in template
        assert "{session_tables}" in template
        assert "Markdown" in template
        assert "| 访谈 |" in template


class TestLLMServiceSingleton:
    """Tests for LLMService singleton behavior"""

    def test_global_instance_exists(self):
        """Test that global instance exists"""
        from app.services.llm_service import llm_service

        assert llm_service is not None
        assert isinstance(llm_service, LLMService)

    def test_singleton_identity(self):
        """Test singleton identity"""
        service1 = LLMService()
        service2 = LLMService()

        assert service1 is service2

        # Same as global
        from app.services.llm_service import llm_service as global_service
        assert service1 is global_service
