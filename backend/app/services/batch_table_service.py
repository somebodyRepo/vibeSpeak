import asyncio
import json
from typing import Dict, Optional
from dataclasses import dataclass, field
from datetime import datetime

from app.services.llm_service import llm_service


@dataclass
class TableGenerationTask:
    """Single table generation task"""
    session_id: str
    project_id: str
    status: str = "pending"  # pending/processing/done/error
    error_message: str = ""
    retry_count: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


@dataclass
class BatchGenerationProgress:
    """Progress tracking for batch generation"""
    project_id: str
    total_count: int = 0
    completed_count: int = 0
    error_count: int = 0
    tasks: Dict[str, TableGenerationTask] = field(default_factory=dict)
    started_at: Optional[datetime] = None
    is_running: bool = False


class BatchTableGenerationService:
    """Service for managing batch table generation tasks"""

    _instance = None
    _lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._progress: Dict[str, BatchGenerationProgress] = {}
        self._queue: asyncio.Queue = asyncio.Queue()
        self._max_concurrent = 3
        self._max_retries = 1
        self._worker_task: Optional[asyncio.Task] = None

    def get_progress(self, project_id: str) -> Optional[BatchGenerationProgress]:
        """Get progress for a project"""
        return self._progress.get(project_id)

    def start_batch_generation(
        self,
        project_id: str,
        session_ids: list[str],
        table_structure_prompt: str,
        session_contents: Dict[str, str],
    ) -> BatchGenerationProgress:
        """Start batch generation for a project"""
        progress = BatchGenerationProgress(
            project_id=project_id,
            total_count=len(session_ids),
            started_at=datetime.utcnow(),
            is_running=True,
        )

        for session_id in session_ids:
            task = TableGenerationTask(
                session_id=session_id,
                project_id=project_id,
            )
            progress.tasks[session_id] = task

            # Add to queue
            self._queue.put_nowait({
                "session_id": session_id,
                "project_id": project_id,
                "table_structure_prompt": table_structure_prompt,
                "final_content": session_contents.get(session_id, ""),
            })

        self._progress[project_id] = progress

        # Start worker if not running
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker())

        return progress

    async def _worker(self):
        """Worker that processes tasks with concurrency limit"""
        semaphore = asyncio.Semaphore(self._max_concurrent)

        async def process_single_task(task_data: dict):
            async with semaphore:
                await self._process_task(task_data)

        tasks = []
        while True:
            try:
                # Get task from queue with timeout
                task_data = await asyncio.wait_for(
                    self._queue.get(),
                    timeout=1.0
                )
                tasks.append(asyncio.create_task(process_single_task(task_data)))
            except asyncio.TimeoutError:
                # Check if all tasks are done
                progress = self._progress.get(task_data.get("project_id", "") if task_data else "")
                if progress and not progress.is_running:
                    break
                continue

            # Clean up completed tasks
            tasks = [t for t in tasks if not t.done()]

        # Wait for remaining tasks
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _process_task(self, task_data: dict):
        """Process a single table generation task"""
        session_id = task_data["session_id"]
        project_id = task_data["project_id"]
        table_structure_prompt = task_data["table_structure_prompt"]
        final_content = task_data["final_content"]

        progress = self._progress.get(project_id)
        if not progress:
            return

        task = progress.tasks.get(session_id)
        if not task:
            return

        task.status = "processing"
        task.started_at = datetime.utcnow()

        try:
            # Generate table
            table_json = await llm_service.generate_session_table(
                table_structure_prompt=table_structure_prompt,
                final_content=final_content,
            )

            # Validate and fix JSON
            table_json = self._validate_and_fix_json(table_json)

            # Update database
            await self._update_session_table(session_id, table_json)

            task.status = "done"
            task.completed_at = datetime.utcnow()
            progress.completed_count += 1

        except Exception as e:
            task.error_message = str(e)

            # Retry logic
            if task.retry_count < self._max_retries:
                task.retry_count += 1
                task.status = "pending"
                # Re-add to queue for retry
                self._queue.put_nowait(task_data)
            else:
                task.status = "error"
                progress.error_count += 1

        # Check if all done
        if progress.completed_count + progress.error_count >= progress.total_count:
            progress.is_running = False

    def _validate_and_fix_json(self, table_json: str) -> str:
        """Validate and fix JSON format"""
        try:
            parsed = json.loads(table_json)
            if "rows" not in parsed:
                table_json = json.dumps({"rows": parsed if isinstance(parsed, list) else []})
            return table_json
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\{[\s\S]*\}', table_json)
            if json_match:
                try:
                    parsed = json.loads(json_match.group())
                    if "rows" not in parsed:
                        return json.dumps({"rows": parsed if isinstance(parsed, list) else []})
                    return json_match.group()
                except json.JSONDecodeError:
                    raise ValueError("Invalid JSON format")
            raise ValueError("No JSON found in response")

    async def _update_session_table(self, session_id: str, table_json: str):
        """Update session in database"""
        from app.models.database import AsyncSessionLocal, InterviewSessionDB
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(InterviewSessionDB).where(InterviewSessionDB.id == session_id)
            )
            session = result.scalar_one_or_none()
            if session:
                session.table_content = table_json
                session.status = "tabled"
                await db.commit()


# Global instance
batch_table_service = BatchTableGenerationService()