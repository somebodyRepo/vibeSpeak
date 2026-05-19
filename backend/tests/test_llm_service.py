"""Unit tests for LLM service Markdown-related methods"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json

from app.services.llm_service import LLMService, llm_service


class TestGenerateSessionMarkdown:
    """Tests for generate_session_markdown method"""

    @pytest.mark.asyncio
    async def test_generate_markdown_success(self):
        """Test successful Markdown generation"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        expected_markdown = """# 访谈记录

## 基本信息
- 访谈对象: 张三
- 访谈时间: 2024年

## 核心发现
- 要点1
- 要点2
"""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = expected_markdown

        service.client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await service.generate_session_markdown(
            transcript="原始转写内容",
            final_content="结构化内容",
        )

        assert result == expected_markdown
        service.client.chat.completions.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_markdown_empty_response(self):
        """Test Markdown generation with empty response"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = None

        service.client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await service.generate_session_markdown(
            transcript="内容",
            final_content="结构化",
        )

        assert result == ""

    @pytest.mark.asyncio
    async def test_generate_markdown_error_handling(self):
        """Test Markdown generation error handling"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        service.client.chat.completions.create = AsyncMock(
            side_effect=Exception("API error")
        )

        result = await service.generate_session_markdown(
            transcript="内容",
            final_content="结构化",
        )

        assert result == ""


class TestSummarizeTables:
    """Tests for summarize_tables method (Markdown-based)"""

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

        session_docs = [
            "# 访谈1\n\n## 基本信息\n- 姓名: 张三",
            "# 访谈2\n\n## 基本信息\n- 姓名: 李四",
        ]

        result = await service.summarize_tables(session_docs=session_docs)

        assert result == expected_markdown

    @pytest.mark.asyncio
    async def test_summarize_formats_docs(self):
        """Test that summarize properly formats input docs"""
        service = LLMService()
        service._initialized = True
        service.client = AsyncMock()
        service.model = "test-model"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "汇总表格"

        service.client.chat.completions.create = AsyncMock(return_value=mock_response)

        session_docs = ["# 访谈1\n内容"]

        await service.summarize_tables(session_docs=session_docs)

        # Check that the prompt contains formatted docs
        call_args = service.client.chat.completions.create.call_args
        system_prompt = call_args.kwargs["messages"][0]["content"]

        assert "访谈 1" in system_prompt

    @pytest.mark.asyncio
    async def test_summarize_no_client(self):
        """Test summarize when client not initialized"""
        service = LLMService()
        service._initialized = True
        service.client = None

        result = await service.summarize_tables(session_docs=[])

        assert result == ""


class TestSyncMethods:
    """Tests for sync versions of methods"""

    def test_generate_session_markdown_sync(self):
        """Test sync version of Markdown generation"""
        service = LLMService()
        service._sync_initialized = True
        service._sync_client = MagicMock()
        service.model = "test-model"

        expected_markdown = "# 访谈\n内容"
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = expected_markdown

        service._sync_client.chat.completions.create = MagicMock(return_value=mock_response)

        result = service.generate_session_markdown_sync(
            transcript="转写",
            final_content="结构化",
        )

        assert result == expected_markdown

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

        result = service.summarize_tables_sync(session_docs=["文档1"])

        assert result == "| 访谈 | 姓名 |"

    def test_sync_methods_without_client(self):
        """Test sync methods when client not available"""
        service = LLMService()
        service._sync_initialized = True
        service._sync_client = None

        result1 = service.generate_session_markdown_sync(transcript="", final_content="")
        result2 = service.summarize_tables_sync(session_docs=[])

        assert result1 == ""
        assert result2 == ""


class TestPromptTemplates:
    """Tests for prompt template correctness"""

    def test_generate_markdown_prompt_template_format(self):
        """Test that generate Markdown prompt template has correct placeholders"""
        template = LLMService.GENERATE_SESSION_MARKDOWN_PROMPT

        assert "{transcript}" in template
        assert "{final_content}" in template
        assert "Markdown" in template
        assert "基本信息" in template

    def test_summarize_markdown_prompt_template_format(self):
        """Test that summarize prompt template has correct placeholders"""
        template = LLMService.SUMMARIZE_MARKDOWN_PROMPT

        assert "{session_docs}" in template
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
