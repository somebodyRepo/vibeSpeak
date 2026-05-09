import { useState, useEffect, useCallback, useRef } from 'react';
import { listSessions, deleteSession } from '../../lib/api';
import type { InterviewSession, Project } from '../../types';

interface SessionListProps {
  project: Project;
  onSelect: (session: InterviewSession) => void;
  onImport: () => void;
  onRecord?: () => void;
  onSessionsLoad?: (sessions: InterviewSession[]) => void;
  refreshKey?: number;
}

export function SessionList({ project, onSelect, onImport, onRecord, onSessionsLoad, refreshKey }: SessionListProps) {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<number | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await listSessions(project.id);
      setSessions(data.sessions);
      onSessionsLoad?.(data.sessions);
      return data.sessions;
    } catch (err) {
      console.error('Failed to load sessions:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [project.id, onSessionsLoad]);

  // 初始加载 & refreshKey 变化时重新加载
  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshKey]);

  // 轮询：如果有处理中的会话，每隔几秒刷新
  useEffect(() => {
    const hasProcessingSessions = sessions.some(
      s => ['pending', 'transcribing', 'extracting', 'validating'].includes(s.status)
    );

    if (hasProcessingSessions) {
      // 每 3 秒轮询一次
      pollingRef.current = window.setInterval(() => {
        loadSessions();
      }, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [sessions, loadSessions]);

  const handleDelete = async (sessionId: string, filename: string) => {
    if (!confirm(`确定要删除访谈 "${filename}" 吗？`)) return;
    try {
      await deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-gray-200 text-gray-600',
      transcribing: 'bg-blue-100 text-blue-600 animate-pulse',
      extracting: 'bg-purple-100 text-purple-600 animate-pulse',
      validating: 'bg-yellow-100 text-yellow-600 animate-pulse',
      done: 'bg-green-100 text-green-600',
      error: 'bg-red-100 text-red-600',
    };
    const labels: Record<string, string> = {
      pending: '待处理',
      transcribing: '转写中',
      extracting: '提取中',
      validating: '验证中',
      done: '已完成',
      error: '出错',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  // 获取处理进度指示器
  const getProgressSteps = (session: InterviewSession) => {
    const steps = [
      { key: 'transcribe', label: '转写', done: !!session.raw_transcript },
      { key: 'extract', label: '提取', done: Object.keys(session.extracted_info || {}).length > 0 },
      { key: 'validate', label: '验证', done: !!session.supplementary_info },
      { key: 'finalize', label: '完成', done: !!session.final_content },
    ];

    const currentStepIndex = steps.findIndex(s => !s.done);

    return (
      <div className="flex items-center gap-1 mt-2">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium
                         ${step.done
                           ? 'bg-green-500 text-white'
                           : index === currentStepIndex
                           ? 'bg-blue-500 text-white animate-pulse'
                           : 'bg-gray-200 text-gray-400'}`}
            >
              {step.done ? '✓' : index + 1}
            </div>
            {index < steps.length - 1 && (
              <div className={`w-6 h-0.5 mx-0.5
                             ${index < currentStepIndex || step.done
                               ? 'bg-green-400'
                               : 'bg-gray-200'}`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-heading font-semibold text-slate-800">
          访谈记录 ({sessions.length})
        </h3>
        <div className="flex gap-2">
          {onRecord && (
            <button
              onClick={onRecord}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white
                         bg-gradient-to-r from-red-400 to-red-500
                         shadow-[0_4px_10px_rgba(239,68,68,0.3)]
                         hover:shadow-[0_6px_14px_rgba(239,68,68,0.4)]
                         transition-all duration-200 cursor-pointer"
            >
              🎤 录音
            </button>
          )}
          <button
            onClick={onImport}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white
                       bg-gradient-to-r from-orange-400 to-orange-500
                       shadow-[0_4px_10px_rgba(251,146,60,0.3)]
                       hover:shadow-[0_6px_14px_rgba(251,146,60,0.4)]
                       transition-all duration-200 cursor-pointer"
          >
            + 导入音频
          </button>
        </div>
      </div>

      {/* Processing indicator */}
      {sessions.some(s => ['transcribing', 'extracting', 'validating'].includes(s.status)) && (
        <div className="p-3 rounded-xl bg-blue-50 flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <span className="text-sm text-blue-700">
            正在自动处理中，状态会自动更新...
          </span>
        </div>
      )}

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <div className="p-8 rounded-2xl bg-gray-50 text-center text-slate-400">
          <p className="mb-2">暂无访谈记录</p>
          <p className="text-sm">点击上方按钮导入音频文件或开始录音</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => {
            const isProcessing = ['transcribing', 'extracting', 'validating'].includes(session.status);
            const isPending = session.status === 'pending';

            return (
              <div
                key={session.id}
                className={`p-4 rounded-xl bg-gray-50
                           shadow-[2px_2px_8px_rgba(0,0,0,0.04),-2px_-2px_8px_rgba(255,255,255,0.6)]
                           hover:shadow-[4px_4px_12px_rgba(0,0,0,0.06)]
                           transition-all duration-200
                           ${isProcessing ? 'border-l-4 border-blue-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-800 truncate">
                        {session.filename}
                      </span>
                      {getStatusBadge(session.status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400 font-body">
                      <span>{session.duration_s?.toFixed(1) || 0}秒</span>
                      <span>{new Date(session.created_at).toLocaleDateString()}</span>
                      {session.raw_transcript && (
                        <span className="text-green-500">✓ 已转写</span>
                      )}
                      {session.final_content && (
                        <span className="text-blue-500">✓ 已完成</span>
                      )}
                    </div>

                    {/* Progress steps */}
                    {(isPending || isProcessing || session.status === 'done') && session.status !== 'error' && (
                      getProgressSteps(session)
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Processing spinner */}
                    {isProcessing && (
                      <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    )}

                    <button
                      onClick={() => onSelect(session)}
                      className="px-3 py-1 rounded-lg text-xs font-medium
                                 bg-gray-200 text-gray-600 hover:bg-gray-300
                                 cursor-pointer transition-colors"
                    >
                      详情
                    </button>

                    {!isProcessing && (
                      <button
                        onClick={() => handleDelete(session.id, session.filename)}
                        className="p-1 rounded text-red-400 hover:text-red-600 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M3 20h18" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Error message */}
                {session.status === 'error' && (
                  <div className="mt-2 p-2 rounded bg-red-50 text-xs text-red-600">
                    处理出错，请点击详情查看或重新上传
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}