"""Unit tests for batch table generation service"""
import json
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.batch_table_service import (
    BatchTableGenerationService,
    BatchGenerationProgress,
    TableGenerationTask,
)


class TestBatchGenerationProgress:
    """Tests for BatchGenerationProgress dataclass"""

    def test_progress_initialization(self):
        """Test progress initialization"""
        progress = BatchGenerationProgress(project_id="test-project")

        assert progress.project_id == "test-project"
        assert progress.total_count == 0
        assert progress.completed_count == 0
        assert progress.error_count == 0
        assert progress.is_running is False
        assert len(progress.tasks) == 0

    def test_progress_with_tasks(self):
        """Test progress with initial tasks"""
        progress = BatchGenerationProgress(
            project_id="test-project",
            total_count=3,
            is_running=True,
        )

        # Add tasks manually
        progress.tasks["session-1"] = TableGenerationTask(
            session_id="session-1",
            project_id="test-project",
        )
        progress.tasks["session-2"] = TableGenerationTask(
            session_id="session-2",
            project_id="test-project",
        )

        assert progress.total_count == 3
        assert len(progress.tasks) == 2


class TestTableGenerationTask:
    """Tests for TableGenerationTask dataclass"""

    def test_task_initialization(self):
        """Test task initialization"""
        task = TableGenerationTask(
            session_id="session-1",
            project_id="project-1",
        )

        assert task.session_id == "session-1"
        assert task.project_id == "project-1"
        assert task.status == "pending"
        assert task.error_message == ""
        assert task.retry_count == 0
        assert task.started_at is None
        assert task.completed_at is None

    def test_task_with_error(self):
        """Test task with error state"""
        task = TableGenerationTask(
            session_id="session-1",
            project_id="project-1",
            status="error",
            error_message="LLM call failed",
            retry_count=1,
        )

        assert task.status == "error"
        assert task.error_message == "LLM call failed"
        assert task.retry_count == 1


class TestBatchTableGenerationService:
    """Tests for BatchTableGenerationService"""

    def test_singleton_pattern(self):
        """Test that service is a singleton"""
        service1 = BatchTableGenerationService()
        service2 = BatchTableGenerationService()

        assert service1 is service2

    def test_get_progress_nonexistent(self):
        """Test get progress for non-existent project"""
        service = BatchTableGenerationService()
        progress = service.get_progress("non-existent-project")

        assert progress is None

    def test_get_progress_existing(self):
        """Test get progress for existing project"""
        service = BatchTableGenerationService()

        # Create progress manually
        service._progress["test-project"] = BatchGenerationProgress(
            project_id="test-project",
            total_count=5,
        )

        progress = service.get_progress("test-project")

        assert progress is not None
        assert progress.project_id == "test-project"
        assert progress.total_count == 5

    @pytest.mark.asyncio
    async def test_start_batch_generation(self):
        """Test starting batch generation"""
        service = BatchTableGenerationService()

        progress = service.start_batch_generation(
            project_id="test-project",
            session_ids=["session-1", "session-2", "session-3"],
            table_structure_prompt="测试提示词",
            session_contents={
                "session-1": "内容1",
                "session-2": "内容2",
                "session-3": "内容3",
            },
        )

        assert progress.project_id == "test-project"
        assert progress.total_count == 3
        assert progress.is_running is True
        assert len(progress.tasks) == 3

        # Verify tasks created
        assert "session-1" in progress.tasks
        assert progress.tasks["session-1"].status == "pending"

        # Clean up the worker task
        if service._worker_task:
            service._worker_task.cancel()
            try:
                await service._worker_task
            except asyncio.CancelledError:
                pass

    def test_validate_and_fix_json_valid(self):
        """Test JSON validation with valid input"""
        service = BatchTableGenerationService()

        valid_json = '{"rows": [{"dimension": "姓名", "value": "张三"}]}'
        result = service._validate_and_fix_json(valid_json)

        assert result == valid_json

    def test_validate_and_fix_json_needs_wrapping(self):
        """Test JSON validation that needs wrapping"""
        service = BatchTableGenerationService()

        # Array that needs to be wrapped in {"rows": ...}
        array_json = '[{"dimension": "姓名", "value": "张三"}]'
        result = service._validate_and_fix_json(array_json)

        parsed = json.loads(result)
        assert "rows" in parsed
        assert len(parsed["rows"]) == 1

    def test_validate_and_fix_json_extract_from_text(self):
        """Test JSON extraction from text with surrounding content"""
        service = BatchTableGenerationService()

        text_with_json = '这是表格数据：{"rows": [{"dimension": "姓名", "value": "张三"}]} 结束'
        result = service._validate_and_fix_json(text_with_json)

        parsed = json.loads(result)
        assert "rows" in parsed

    def test_validate_and_fix_json_invalid(self):
        """Test JSON validation with invalid input"""
        service = BatchTableGenerationService()

        with pytest.raises(ValueError, match="No JSON found"):
            service._validate_and_fix_json("这不是JSON")


class TestBatchTableGenerationServiceAsync:
    """Async tests for BatchTableGenerationService"""

    @pytest.mark.asyncio
    async def test_process_task_success(self):
        """Test successful task processing"""
        service = BatchTableGenerationService()

        # Setup progress
        progress = BatchGenerationProgress(
            project_id="test-project",
            total_count=1,
            is_running=True,
        )
        progress.tasks["session-1"] = TableGenerationTask(
            session_id="session-1",
            project_id="test-project",
        )
        service._progress["test-project"] = progress

        # Mock LLM service
        with patch.object(
            service,
            "_update_session_table",
            new_callable=AsyncMock
        ):
            with patch(
                "app.services.batch_table_service.llm_service"
            ) as mock_llm:
                mock_llm.generate_session_table = AsyncMock(
                    return_value='{"rows": [{"dimension": "姓名", "value": "张三"}]}'
                )

                task_data = {
                    "session_id": "session-1",
                    "project_id": "test-project",
                    "table_structure_prompt": "测试提示词",
                    "final_content": "测试内容",
                }

                await service._process_task(task_data)

                # Verify task completed
                assert progress.tasks["session-1"].status == "done"
                assert progress.completed_count == 1
                assert progress.tasks["session-1"].completed_at is not None

    @pytest.mark.asyncio
    async def test_process_task_with_retry(self):
        """Test task processing with retry"""
        service = BatchTableGenerationService()

        # Setup progress
        progress = BatchGenerationProgress(
            project_id="test-project",
            total_count=1,
            is_running=True,
        )
        progress.tasks["session-1"] = TableGenerationTask(
            session_id="session-1",
            project_id="test-project",
        )
        service._progress["test-project"] = progress

        # Mock LLM to fail
        with patch(
            "app.services.batch_table_service.llm_service"
        ) as mock_llm:
            mock_llm.generate_session_table = AsyncMock(
                side_effect=Exception("LLM error")
            )

            task_data = {
                "session_id": "session-1",
                "project_id": "test-project",
                "table_structure_prompt": "测试提示词",
                "final_content": "测试内容",
            }

            await service._process_task(task_data)

            # Verify retry logic
            assert progress.tasks["session-1"].retry_count == 1
            assert progress.tasks["session-1"].status == "pending"  # Will be retried

    @pytest.mark.asyncio
    async def test_process_task_max_retries_exceeded(self):
        """Test task processing when max retries exceeded"""
        service = BatchTableGenerationService()

        # Setup progress with task already at max retries
        progress = BatchGenerationProgress(
            project_id="test-project",
            total_count=1,
            is_running=True,
        )
        progress.tasks["session-1"] = TableGenerationTask(
            session_id="session-1",
            project_id="test-project",
            retry_count=1,  # Already at max
        )
        service._progress["test-project"] = progress

        # Mock LLM to fail
        with patch(
            "app.services.batch_table_service.llm_service"
        ) as mock_llm:
            mock_llm.generate_session_table = AsyncMock(
                side_effect=Exception("LLM error")
            )

            task_data = {
                "session_id": "session-1",
                "project_id": "test-project",
                "table_structure_prompt": "测试提示词",
                "final_content": "测试内容",
            }

            await service._process_task(task_data)

            # Verify error state
            assert progress.tasks["session-1"].status == "error"
            assert progress.error_count == 1

    @pytest.mark.asyncio
    async def test_batch_completion_detection(self):
        """Test that batch is marked complete when all tasks done"""
        service = BatchTableGenerationService()

        # Setup progress with one task
        progress = BatchGenerationProgress(
            project_id="test-project",
            total_count=1,
            is_running=True,
        )
        progress.tasks["session-1"] = TableGenerationTask(
            session_id="session-1",
            project_id="test-project",
        )
        service._progress["test-project"] = progress

        with patch.object(
            service,
            "_update_session_table",
            new_callable=AsyncMock
        ):
            with patch(
                "app.services.batch_table_service.llm_service"
            ) as mock_llm:
                mock_llm.generate_session_table = AsyncMock(
                    return_value='{"rows": []}'
                )

                task_data = {
                    "session_id": "session-1",
                    "project_id": "test-project",
                    "table_structure_prompt": "测试",
                    "final_content": "内容",
                }

                await service._process_task(task_data)

                # Verify batch marked complete
                assert progress.is_running is False
