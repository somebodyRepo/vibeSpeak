import { useState, useEffect, useCallback } from 'react';
import { listSessions, deleteSession, transcribeSession, extractSessionInfo, validateSession, finalizeSession } from '../../lib/api';
import type { InterviewSession, Project } from '../../types';

interface SessionListProps {
  project: Project;
  onSelect: (session: InterviewSession) => void;
  onImport: () => void;
  onRecord?: () => void;
  onSessionsLoad?: (sessions: InterviewSession[]) => void;
}

export function SessionList({ project, onSelect, onImport, onRecord, onSessionsLoad }: SessionListProps) {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await listSessions(project.id);
      setSessions(data.sessions);
      onSessionsLoad?.(data.sessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [project.id, onSessionsLoad]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleDelete = async (sessionId: string, filename: string) => {
    if (!confirm(`确定要删除访谈 "${filename}" 吗？`)) return;
    try {
      await deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const handleProcess = async (session: InterviewSession, action: 'transcribe' | 'extract' | 'validate' | 'finalize') => {
    setProcessing(session.id);
    try {
      if (action === 'transcribe') {
        await transcribeSession(session.id);
        alert('转写任务已启动，请稍后刷新查看结果');
      } else if (action === 'extract') {
        await extractSessionInfo(session.id);
        alert('信息提取完成');
      } else if (action === 'validate') {
        await validateSession(session.id);
        alert('验证完成');
      } else if (action === 'finalize') {
        await finalizeSession(session.id);
        alert('最终内容已生成');
      }
      await loadSessions();
    } catch (err) {
      alert('处理失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-gray-200 text-gray-600',
      transcribing: 'bg-blue-100 text-blue-600',
      extracting: 'bg-purple-100 text-purple-600',
      validating: 'bg-yellow-100 text-yellow-600',
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

  const getNextAction = (session: InterviewSession) => {
    if (session.status === 'pending' && !session.raw_transcript) {
      return { label: '转写', action: 'transcribe' as const };
    }
    if (session.raw_transcript && Object.keys(session.extracted_info || {}).length === 0) {
      return { label: '提取信息', action: 'extract' as const };
    }
    if (Object.keys(session.extracted_info || {}).length > 0 && !session.supplementary_info) {
      return { label: '验证补充', action: 'validate' as const };
    }
    if (session.supplementary_info && !session.final_content) {
      return { label: '生成最终', action: 'finalize' as const };
    }
    return null;
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

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <div className="p-8 rounded-2xl bg-gray-50 text-center text-slate-400">
          <p className="mb-2">暂无访谈记录</p>
          <p className="text-sm">点击上方按钮导入音频文件</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => {
            const nextAction = getNextAction(session);
            return (
              <div
                key={session.id}
                className="p-4 rounded-xl bg-gray-50
                           shadow-[2px_2px_8px_rgba(0,0,0,0.04),-2px_-2px_8px_rgba(255,255,255,0.6)]
                           hover:shadow-[4px_4px_12px_rgba(0,0,0,0.06)]
                           transition-all duration-200"
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
                  </div>
                  <div className="flex items-center gap-2">
                    {nextAction && (
                      <button
                        onClick={() => handleProcess(session, nextAction.action)}
                        disabled={processing === session.id}
                        className="px-3 py-1 rounded-lg text-xs font-medium
                                   bg-blue-100 text-blue-600 hover:bg-blue-200
                                   disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        {processing === session.id ? '处理中...' : nextAction.label}
                      </button>
                    )}
                    <button
                      onClick={() => onSelect(session)}
                      className="px-3 py-1 rounded-lg text-xs font-medium
                                 bg-gray-200 text-gray-600 hover:bg-gray-300
                                 cursor-pointer transition-colors"
                    >
                      详情
                    </button>
                    <button
                      onClick={() => handleDelete(session.id, session.filename)}
                      className="p-1 rounded text-red-400 hover:text-red-600 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M3 20h18" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
