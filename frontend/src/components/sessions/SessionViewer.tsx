import { useState, useEffect, useCallback } from 'react';
import { getSession, updateSession, exportSessionTranscript, exportSessionExtracted, exportSessionFinal } from '../../lib/api';
import type { InterviewSession } from '../../types';

interface SessionViewerProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionViewer({ sessionId, onBack }: SessionViewerProps) {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSupplementary, setEditingSupplementary] = useState(false);
  const [supplementaryText, setSupplementaryText] = useState('');

  const loadSession = useCallback(async () => {
    try {
      const data = await getSession(sessionId);
      setSession(data);
      setSupplementaryText(data.supplementary_info || '');
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleSaveSupplementary = async () => {
    if (!session) return;
    try {
      await updateSession(session.id, { supplementary_info: supplementaryText });
      setSession(prev => prev ? { ...prev, supplementary_info: supplementaryText } : null);
      setEditingSupplementary(false);
    } catch (err) {
      alert('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const handleExport = async (type: 'transcript' | 'extracted' | 'final') => {
    if (!session) return;
    try {
      let blob: Blob;
      let filename: string;
      switch (type) {
        case 'transcript':
          blob = await exportSessionTranscript(session.id);
          filename = `${session.filename}_transcript.txt`;
          break;
        case 'extracted':
          blob = await exportSessionExtracted(session.id);
          filename = `${session.filename}_extracted.md`;
          break;
        case 'final':
          blob = await exportSessionFinal(session.id);
          filename = `${session.filename}_final.md`;
          break;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('导出失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('已复制到剪贴板');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-4 text-center text-slate-500">
        未找到访谈记录
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-slate-500 hover:bg-gray-100 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-heading font-semibold text-slate-800">
              {session.filename}
            </h2>
            <p className="text-sm text-slate-400 font-body">
              {session.duration_s?.toFixed(1) || 0}秒 · {new Date(session.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('transcript')}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600
                       bg-gray-100 hover:bg-gray-200 cursor-pointer transition-colors"
          >
            导出转写
          </button>
          <button
            onClick={() => handleExport('final')}
            disabled={!session.final_content}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white
                       bg-gradient-to-r from-blue-500 to-blue-600
                       disabled:opacity-50 disabled:cursor-not-allowed
                       cursor-pointer"
          >
            导出最终
          </button>
        </div>
      </div>

      {/* Four Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Column 1: Raw Transcript */}
        <div className="p-4 rounded-2xl bg-gray-50
                        shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04),inset_-3px_-3px_8px_rgba(255,255,255,0.7)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-slate-700 font-heading">原始转写</h3>
            {session.raw_transcript && (
              <button
                onClick={() => copyToClipboard(session.raw_transcript)}
                className="text-xs text-blue-500 hover:text-blue-600 cursor-pointer"
              >
                复制
              </button>
            )}
          </div>
          <div className="h-96 overflow-y-auto text-sm text-slate-600 font-body whitespace-pre-wrap">
            {session.raw_transcript || (
              <span className="text-slate-400">暂无转写内容</span>
            )}
          </div>
        </div>

        {/* Column 2: Extracted Info */}
        <div className="p-4 rounded-2xl bg-gray-50
                        shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04),inset_-3px_-3px_8px_rgba(255,255,255,0.7)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-slate-700 font-heading">提取信息</h3>
            {session.extracted_info && (
              <button
                onClick={() => copyToClipboard(session.extracted_info)}
                className="text-xs text-blue-500 hover:text-blue-600 cursor-pointer"
              >
                复制
              </button>
            )}
          </div>
          <div className="h-96 overflow-y-auto text-sm text-slate-600 font-body whitespace-pre-wrap">
            {session.extracted_info || (
              <span className="text-slate-400">暂无提取信息</span>
            )}
          </div>
        </div>

        {/* Column 3: Supplementary Info */}
        <div className="p-4 rounded-2xl bg-gray-50
                        shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04),inset_-3px_-3px_8px_rgba(255,255,255,0.7)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-slate-700 font-heading">补充信息</h3>
            {!editingSupplementary && (
              <button
                onClick={() => setEditingSupplementary(true)}
                className="text-xs text-blue-500 hover:text-blue-600 cursor-pointer"
              >
                编辑
              </button>
            )}
          </div>
          {editingSupplementary ? (
            <div className="space-y-3">
              <textarea
                value={supplementaryText}
                onChange={e => setSupplementaryText(e.target.value)}
                placeholder="输入补充的遗漏信息..."
                className="w-full h-80 px-3 py-2 rounded-xl bg-gray-100 text-slate-700 font-body text-sm
                           shadow-[inset_2px_2px_6px_rgba(0,0,0,0.06)]
                           focus:outline-none focus:ring-2 focus:ring-blue-400
                           resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingSupplementary(false);
                    setSupplementaryText(session.supplementary_info || '');
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm text-slate-600 bg-gray-200 hover:bg-gray-300 cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveSupplementary}
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm text-white bg-blue-500 hover:bg-blue-600 cursor-pointer"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <div className="h-96 overflow-y-auto text-sm text-slate-600 font-body whitespace-pre-wrap">
              {session.supplementary_info || (
                <span className="text-slate-400">暂无补充信息</span>
              )}
            </div>
          )}
        </div>

        {/* Column 4: Final Content */}
        <div className="p-4 rounded-2xl bg-gray-50
                        shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04),inset_-3px_-3px_8px_rgba(255,255,255,0.7)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-slate-700 font-heading">最终内容</h3>
            {session.final_content && (
              <button
                onClick={() => copyToClipboard(session.final_content)}
                className="text-xs text-blue-500 hover:text-blue-600 cursor-pointer"
              >
                复制
              </button>
            )}
          </div>
          <div className="h-96 overflow-y-auto text-sm text-slate-600 font-body whitespace-pre-wrap">
            {session.final_content || (
              <span className="text-slate-400">暂无最终内容</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
