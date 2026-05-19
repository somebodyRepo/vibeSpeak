"""Unit tests for batch table generation service"""
import pytest
import asyncio
from unittest.mock import AsyncMock, patch

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
            session_data={
                "session-1": {"transcript": "转写内容1", "final_content": "结构化内容1"},
                "session-2": {"transcript": "转写内容2", "final_content": "结构化内容2"},
                "session-3": {"transcript": "转写内容3", "final_content": "结构化内容3"},
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
                mock_llm.generate_session_markdown = AsyncMock(
                    return_value='# 访谈记录\n\n## 基本信息\n访谈对象: 张三'
                )

                task_data = {
                    "session_id": "session-1",
                    "project_id": "test-project",
                    "transcript": "转写内容",
                    "final_content": "结构化内容",
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
            mock_llm.generate_session_markdown = AsyncMock(
                side_effect=Exception("LLM error")
            )

            task_data = {
                "session_id": "session-1",
                "project_id": "test-project",
                "transcript": "转写内容",
                "final_content": "结构化内容",
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
            mock_llm.generate_session_markdown = AsyncMock(
                side_effect=Exception("LLM error")
            )

            task_data = {
                "session_id": "session-1",
                "project_id": "test-project",
                "transcript": "转写内容",
                "final_content": "结构化内容",
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
                mock_llm.generate_session_markdown = AsyncMock(
                    return_value='# 访谈记录\n\n## 基本信息\n内容'
                )

                task_data = {
                    "session_id": "session-1",
                    "project_id": "test-project",
                    "transcript": "转写内容",
                    "final_content": "结构化内容",
                }

                await service._process_task(task_data)

                # Verify batch marked complete
                assert progress.is_running is False
