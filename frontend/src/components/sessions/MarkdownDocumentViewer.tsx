import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownDocumentViewerProps {
  content: string;
  sessionId: string;
  onSave: (newContent: string) => void;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export function MarkdownDocumentViewer({
  content,
  onSave,
  onRegenerate,
  isRegenerating = false,
}: MarkdownDocumentViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);

  const handleEdit = () => {
    setEditContent(content);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditContent(content);
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editContent);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (confirm('确定要重新生成文档吗？当前内容将被覆盖。')) {
      onRegenerate();
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-3">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full h-96 px-4 py-3 rounded-xl bg-gray-50 text-slate-700 font-mono text-sm
                     shadow-[inset_2px_2px_6px_rgba(0,0,0,0.06)]
                     focus:outline-none focus:ring-2 focus:ring-blue-400
                     resize-none"
          placeholder="输入 Markdown 内容..."
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600
                       bg-gray-200 hover:bg-gray-300
                       disabled:opacity-50 disabled:cursor-not-allowed
                       cursor-pointer transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white
                       bg-blue-500 hover:bg-blue-600
                       disabled:opacity-50 disabled:cursor-not-allowed
                       cursor-pointer transition-colors"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600
                     bg-gray-100 hover:bg-gray-200
                     disabled:opacity-50 disabled:cursor-not-allowed
                     cursor-pointer transition-colors"
        >
          {isRegenerating ? '生成中...' : '重新生成'}
        </button>
        <button
          onClick={handleEdit}
          disabled={isRegenerating}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-white
                     bg-gradient-to-r from-blue-500 to-blue-600
                     shadow-[0_2px_8px_rgba(59,130,246,0.3)]
                     hover:shadow-[0_4px_12px_rgba(59,130,246,0.4)]
                     disabled:opacity-50 disabled:cursor-not-allowed
                     cursor-pointer transition-all"
        >
          编辑
        </button>
      </div>

      {/* Markdown Preview */}
      <div className="prose prose-slate max-w-none p-4 rounded-xl bg-white
                      shadow-[2px_2px_8px_rgba(0,0,0,0.04),-2px_-2px_8px_rgba(255,255,255,0.6)]
                      max-h-[600px] overflow-y-auto">
        {content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        ) : (
          <p className="text-slate-400 text-center py-8">
            暂无文档内容
          </p>
        )}
      </div>
    </div>
  );
}