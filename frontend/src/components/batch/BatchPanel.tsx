import { useState, useCallback, useEffect, useRef } from 'react';
import { uploadAudio, listTranscriptions, deleteTranscription, getTranscription } from '../../lib/api';
import type { TranscriptionTask } from '../../types';
import { FileUploader } from './FileUploader';
import { TaskList } from './TaskList';
import { TranscriptViewer } from './TranscriptViewer';

export function BatchPanel() {
  const [tasks, setTasks] = useState<TranscriptionTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TranscriptionTask | null>(null);
  const [isLoadingTask, setIsLoadingTask] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

  // Track if initial load is done
  const initialLoadDone = useRef(false);

  // Load task list (for sidebar) - 5s interval, only when needed
  const loadTasks = useCallback(async () => {
    try {
      const data = await listTranscriptions();
      setTasks(prev => {
        // Only update if changed to avoid re-renders
        if (JSON.stringify(prev) !== JSON.stringify(data.tasks)) {
          return data.tasks;
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }, []);

  // Load selected task details - silent refresh (no loading spinner)
  const loadSelectedTask = useCallback(async (silent = false) => {
    if (!selectedTaskId) return;

    if (!silent) setIsLoadingTask(true);
    try {
      const task = await getTranscription(selectedTaskId);
      setSelectedTask(prev => {
        // Only update if actually changed
        if (!prev || JSON.stringify(prev) !== JSON.stringify(task)) {
          return task;
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to load task details:', err);
    } finally {
      if (!silent) setIsLoadingTask(false);
    }
  }, [selectedTaskId]);

  // Initial load
  useEffect(() => {
    if (!initialLoadDone.current) {
      loadTasks();
      initialLoadDone.current = true;
    }
  }, [loadTasks]);

  // Poll for task list updates - every 10 seconds
  useEffect(() => {
    const interval = setInterval(loadTasks, 10000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // Refresh selected task when ID changes (initial load only)
  useEffect(() => {
    if (selectedTaskId) {
      loadSelectedTask(false);
    } else {
      setSelectedTask(null);
    }
  }, [selectedTaskId]);

  // Poll for selected task updates - only if task is not done
  useEffect(() => {
    if (!selectedTaskId || !selectedTask) return;

    // Only poll if task is still processing or pending
    if (selectedTask.status !== 'processing' && selectedTask.status !== 'pending') {
      return;
    }

    const interval = setInterval(() => {
      loadSelectedTask(true); // silent refresh
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedTaskId, selectedTask?.status]);

  // Handle task selection
  const handleSelectTask = useCallback((task: TranscriptionTask) => {
    setSelectedTaskId(task.id);
    // Immediately load task details with loading spinner
    setIsLoadingTask(true);
    getTranscription(task.id)
      .then(task => setSelectedTask(task))
      .catch(err => console.error('Failed to load task:', err))
      .finally(() => setIsLoadingTask(false));
  }, []);

  const handleFileUpload = useCallback(async (files: File[]) => {
    for (const file of files) {
      const uploadId = `${file.name}-${Date.now()}`;
      setUploadProgress((prev) => ({ ...prev, [uploadId]: 0 }));

      try {
        // Simulate progress
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => ({
            ...prev,
            [uploadId]: Math.min((prev[uploadId] || 0) + 10, 90),
          }));
        }, 200);

        const result = await uploadAudio(file);

        clearInterval(progressInterval);
        setUploadProgress((prev) => ({ ...prev, [uploadId]: 100 }));

        // Auto-select the newly uploaded task
        setSelectedTaskId(result.task_id);

        // Load task details
        const task = await getTranscription(result.task_id);
        setSelectedTask(task);

        // Reload tasks list
        await loadTasks();

        // Clear progress after a delay
        setTimeout(() => {
          setUploadProgress((prev) => {
            const { [uploadId]: _, ...rest } = prev;
            return rest;
          });
        }, 2000);
      } catch (err) {
        console.error('Upload failed:', err);
        alert(`上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
        setUploadProgress((prev) => {
          const { [uploadId]: _, ...rest } = prev;
          return rest;
        });
      }
    }
  }, [loadTasks]);

  const handleDelete = useCallback(async (taskId: string) => {
    if (!confirm('确定要删除这个转写任务吗？')) return;

    try {
      await deleteTranscription(taskId);
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
        setSelectedTask(null);
      }
      await loadTasks();
    } catch (err) {
      alert('删除失败');
    }
  }, [loadTasks, selectedTaskId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">批量转写</h1>
        <p className="mt-1 text-sm text-gray-400">上传会议录音、访谈音频进行离线转写</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Upload & List */}
        <div className="space-y-4">
          <FileUploader
            onUpload={handleFileUpload}
            uploadProgress={uploadProgress}
          />

          <TaskList
            tasks={tasks}
            onSelect={handleSelectTask}
            onDelete={handleDelete}
            selectedId={selectedTaskId ?? undefined}
          />
        </div>

        {/* Right Column: Viewer */}
        <div>
          {isLoadingTask ? (
            <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-gray-800 bg-gray-900/50 text-gray-500">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-purple-500" />
              <p className="mt-3 text-sm">加载中...</p>
            </div>
          ) : selectedTask ? (
            <TranscriptViewer task={selectedTask} />
          ) : (
            <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 bg-gray-900/30 text-gray-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-800 mb-4">
                <svg
                  className="h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <p className="text-base font-medium text-gray-400">暂无选中的任务</p>
              <p className="mt-2 text-sm text-gray-500 text-center max-w-xs">
                上传音频文件后，点击左侧列表中的任务查看转写结果
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
                <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
                支持自动选中刚上传的文件
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
