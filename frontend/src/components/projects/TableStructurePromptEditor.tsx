import { useState, useEffect } from 'react';
import { designTableStructure, updateTableStructure, getTableStructure } from '../../lib/api';

interface TableStructurePromptEditorProps {
  projectId: string;
  hasOutline: boolean;
  hasCompletedSessions: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function TableStructurePromptEditor({
  projectId,
  hasOutline,
  hasCompletedSessions,
  onClose,
  onSave,
}: TableStructurePromptEditorProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    // Load existing prompt on mount
    const loadPrompt = async () => {
      try {
        const result = await getTableStructure(projectId);
        if (result.prompt) {
          setPrompt(result.prompt);
          setIsEditing(true); // Already has saved content
        }
      } catch (err) {
        console.error('Failed to load table structure:', err);
      }
    };
    loadPrompt();
  }, [projectId]);

  const handleDesign = async () => {
    if (!hasOutline) {
      setError('项目无关联提纲，无法设计表格结构');
      return;
    }
    if (!hasCompletedSessions) {
      setError('无已完成的访谈内容，无法设计表格结构');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await designTableStructure(projectId);
      setPrompt(result.prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!prompt.trim()) {
      setError('提示词不能为空');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await updateTableStructure(projectId, prompt);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const canDesign = hasOutline && hasCompletedSessions;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col
                      shadow-[0_10px_40px_rgba(0,0,0,0.2)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-heading font-semibold text-slate-800">
            表格结构提示词编辑
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-gray-100 hover:text-slate-600 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Warning */}
        {isEditing && (
          <div className="px-4 pt-3">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700 text-sm">
              ⚠️ 手动编辑后，重新生成将覆盖当前内容
            </div>
          </div>
        )}

        {/* Conditions Check */}
        {!canDesign && (
          <div className="px-4 pt-3">
            <div className="p-2 rounded-lg bg-gray-100 text-slate-600 text-sm">
              <p className="font-medium">条件不满足，无法自动生成：</p>
              <ul className="mt-1 list-disc list-inside">
                {!hasOutline && <li>项目未关联提纲</li>}
                {!hasCompletedSessions && <li>无已完成的访谈内容</li>}
              </ul>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 pt-3">
            <div className="p-2 rounded-lg bg-red-100 text-red-600 text-sm">
              {error}
            </div>
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 p-4 overflow-hidden">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="点击\"生成提示词\"按钮自动生成，或手动输入表格结构提示词..."
            className="w-full h-full min-h-[300px] p-3 rounded-xl bg-gray-50
                       text-slate-800 font-body text-sm leading-relaxed
                       shadow-[inset_2px_2px_6px_rgba(0,0,0,0.04)]
                       focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                       placeholder:text-slate-400 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-4 border-t border-gray-200">
          <button
            onClick={handleDesign}
            disabled={loading || !canDesign}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white
                       bg-gradient-to-r from-blue-500 to-blue-600
                       shadow-[0_4px_12px_rgba(59,130,246,0.3)]
                       hover:shadow-[0_6px_16px_rgba(59,130,246,0.4)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer"
          >
            {loading ? '生成中...' : '生成提示词'}
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600
                       bg-gray-100
                       shadow-[3px_3px_8px_rgba(0,0,0,0.08),-3px_-3px_8px_rgba(255,255,255,0.8)]
                       hover:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08)]
                       transition-all duration-200 cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white
                       bg-gradient-to-r from-green-500 to-green-600
                       shadow-[0_4px_12px_rgba(34,197,94,0.3)]
                       hover:shadow-[0_6px_16px_rgba(34,197,94,0.4)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
