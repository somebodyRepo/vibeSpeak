import { useState, useEffect } from 'react';
import { generateStructurePrompt, getStructurePrompt, updateStructurePrompt } from '../../lib/api';

interface PromptEditorProps {
  projectId: string;
  onComplete: () => void;
  onClose: () => void;
}

export function PromptEditor({ projectId, onComplete, onClose }: PromptEditorProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load existing prompt on mount
  useEffect(() => {
    const loadPrompt = async () => {
      setLoading(true);
      try {
        const response = await getStructurePrompt(projectId);
        setPrompt(response.table_structure_prompt || '');
      } catch (err) {
        console.error('Failed to load prompt:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPrompt();
  }, [projectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const response = await generateStructurePrompt(projectId);
      setPrompt(response.table_structure_prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成提示词失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateStructurePrompt(projectId, prompt);
      onComplete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存提示词失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="w-full max-w-3xl p-6 rounded-2xl bg-white
                      shadow-[0_8px_32px_rgba(0,0,0,0.12)] max-h-[90vh] flex flex-col">
        <h2 className="text-xl font-heading font-semibold text-slate-800 mb-4">
          提示词模板编辑器
        </h2>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white
                       bg-gradient-to-r from-orange-500 to-orange-600
                       shadow-[0_4px_12px_rgba(249,115,22,0.3)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       cursor-pointer transition-all flex items-center gap-2"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                自动生成
              </>
            )}
          </button>
          <span className="text-xs text-slate-400">
            基于提纲和访谈记录自动生成多维度提示词模板
          </span>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Editor */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="flex-1 min-h-0 mb-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={"点击\"自动生成\"按钮生成提示词模板，或手动输入自定义模板...\n\n模板中可使用以下占位符：\n- {transcript} - 访谈原始转写文本\n- {final_content} - 已提取的结构化内容"}
              className="w-full h-full p-4 rounded-xl border border-gray-200
                         text-sm font-mono text-slate-700
                         resize-none focus:outline-none focus:ring-2 focus:ring-blue-500
                         shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04)]"
            />
          </div>
        )}

        {/* Help text */}
        <div className="mb-4 p-3 rounded-xl bg-blue-50 text-xs text-slate-600">
          <strong className="text-slate-700">提示：</strong>
          提示词模板定义了生成文档的结构和内容组织方式。
          生成的文档将严格遵循模板中的维度和格式要求。
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600
                       bg-gray-100 hover:bg-gray-200
                       disabled:opacity-50 cursor-pointer transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!prompt.trim() || saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white
                       bg-gradient-to-r from-blue-500 to-blue-600
                       shadow-[0_4px_12px_rgba(59,130,246,0.3)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       cursor-pointer transition-all"
          >
            {saving ? '保存中...' : '保存模板'}
          </button>
        </div>
      </div>
    </div>
  );
}
