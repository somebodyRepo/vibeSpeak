import type { TranscriptionTask } from '../../types';

interface TaskListProps {
  tasks: TranscriptionTask[];
  onSelect: (task: TranscriptionTask) => void;
  onDelete: (taskId: string) => void;
  selectedId?: string;
}

export function TaskList({ tasks, onSelect, onDelete, selectedId }: TaskListProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'text-green-400 bg-green-400/10';
      case 'processing':
        return 'text-yellow-400 bg-yellow-400/10';
      case 'error':
        return 'text-red-400 bg-red-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'done':
        return '完成';
      case 'processing':
        return '处理中';
      case 'error':
        return '错误';
      default:
        return '等待中';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-6 text-center text-gray-500">
        <p className="text-sm">暂无转写任务</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/30">
      <div className="border-b border-gray-800 px-4 py-3">
        <h3 className="text-sm font-medium text-gray-300">任务列表</h3>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => onSelect(task)}
            className={`flex cursor-pointer items-center justify-between border-b border-gray-800 px-4 py-3 transition-colors last:border-0 hover:bg-gray-800/50 ${
              selectedId === task.id ? 'bg-purple-500/10' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm text-gray-200">{task.filename}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${getStatusColor(
                    task.status
                  )}`}
                >
                  {getStatusText(task.status)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                <span>{formatDuration(task.duration_s)}</span>
                <span>{formatDate(task.created_at)}</span>
              </div>
            </div>

            <div className="ml-4 flex items-center gap-2">
              {task.status === 'processing' && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-purple-500" />
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(task.id);
                }}
                className="flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
