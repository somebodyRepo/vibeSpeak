import { useState, useRef } from 'react';
import type { Project } from '../../types';

interface ProjectWithOutlineCreatorProps {
  onSave: (project: Project) => void;
  onCancel: () => void;
}

export function ProjectWithOutlineCreator({ onSave, onCancel }: ProjectWithOutlineCreatorProps) {
  const [mode, setMode] = useState<'upload' | 'edit'>('edit');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [markdownContent, setMarkdownContent] = useState('');
  const [previewSections, setPreviewSections] = useState<{ title: string; questions: string[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 解析 Markdown 内容，生成预览
  const parseMarkdownPreview = (content: string) => {
    const sections: { title: string; questions: string[] }[] = [];
    let currentSection: { title: string; questions: string[] } | null = null;
    let extractedTitle = '';

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 匹配标题
      const headerMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (headerMatch) {
        const headerLevel = trimmed.split(' ')[0].length;
        const title = headerMatch[1];

        // 一级标题作为项目名
        if (headerLevel === 1 && !extractedTitle) {
          extractedTitle = title;
          // 移除常见后缀
          for (const suffix of ['提纲', '大纲', '问卷', '调研提纲', '访谈提纲']) {
            if (extractedTitle.endsWith(suffix)) {
              extractedTitle = extractedTitle.slice(0, -suffix.length).trim();
              break;
            }
          }
          continue;
        }

        // 其他标题作为板块
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = { title, questions: [] };
      } else if (currentSection) {
        // 匹配列表项
        const listMatch = trimmed.match(/^[-*]\s+(.+)$|^\d+\.\s+(.+)$/);
        if (listMatch) {
          const question = listMatch[1] || listMatch[2];
          currentSection.questions.push(question);
        }
      }
    }

    // 保存最后一个板块
    if (currentSection) {
      sections.push(currentSection);
    }

    // 如果没有手动输入项目名，使用解析出的名称
    if (!projectName && extractedTitle) {
      setProjectName(extractedTitle);
    }

    setPreviewSections(sections);
  };

  // 处理 Markdown 内容变化
  const handleMarkdownChange = (content: string) => {
    setMarkdownContent(content);
    parseMarkdownPreview(content);
  };

  // 处理文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.md')) {
      setError('请上传 Markdown 格式的文件 (.md)');
      return;
    }

    try {
      const content = await file.text();
      handleMarkdownChange(content);
      setMode('edit'); // 切换到编辑模式显示预览
    } catch {
      setError('文件读取失败');
    }
  };

  // 提交创建
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!markdownContent.trim()) {
      setError('请输入或上传提纲内容');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { getAuthHeaders } = await import('../../lib/auth');
      const { getApiBase } = await import('../../lib/config');

      const response = await fetch(`${getApiBase()}/projects/import-with-outline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          project_name: projectName || undefined,
          description: description || undefined,
          markdown_content: markdownContent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '创建失败');
      }

      const data = await response.json();
      onSave(data as Project);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  // 示例 Markdown
  const exampleMarkdown = `# 某某访谈提纲

## 基本信息
- 您的姓名是什么？
- 您的职位是什么？
- 在这个岗位工作了多久？

## 工作内容
- 您主要负责哪些工作？
- 工作中遇到的主要挑战是什么？
- 如何解决这些挑战？

## 未来规划
- 对未来工作有什么计划？
- 有什么改进建议？`;

  return (
    <div className="p-6 rounded-2xl bg-gray-100
                    shadow-[inset_5px_5px_15px_rgba(0,0,0,0.05),inset_-5px_-5px_15px_rgba(255,255,255,0.8)]">
      <h2 className="text-xl font-heading font-semibold text-slate-800 mb-6">
        创建项目与提纲
      </h2>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('upload')}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors
                     ${mode === 'upload'
                       ? 'bg-blue-500 text-white'
                       : 'bg-gray-200 text-slate-600 hover:bg-gray-300'}`}
        >
          上传文件
        </button>
        <button
          onClick={() => setMode('edit')}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors
                     ${mode === 'edit'
                       ? 'bg-blue-500 text-white'
                       : 'bg-gray-200 text-slate-600 hover:bg-gray-300'}`}
        >
          直接编辑
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Upload Mode */}
        {mode === 'upload' && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="p-8 border-2 border-dashed border-gray-300 rounded-xl
                       text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50
                       transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm text-slate-600 font-body">
              点击上传 Markdown 文件
            </p>
            <p className="text-xs text-slate-400 mt-1">
              文件格式: .md, .markdown, .txt
            </p>
          </div>
        )}

        {/* Edit Mode */}
        {mode === 'edit' && (
          <>
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1 font-body">
                项目名称（可修改）
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="从 Markdown 标题自动提取，或手动输入"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-100 text-slate-800 font-body
                           shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08),inset_-3px_-3px_8px_rgba(255,255,255,0.8)]
                           focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                           placeholder:text-slate-400"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1 font-body">
                项目描述（可选）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述项目的调研目标和内容"
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-100 text-slate-800 font-body
                           shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08),inset_-3px_-3px_8px_rgba(255,255,255,0.8)]
                           focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                           placeholder:text-slate-400 resize-none"
              />
            </div>

            {/* Markdown Editor */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1 font-body">
                提纲内容 *
              </label>
              <textarea
                value={markdownContent}
                onChange={(e) => handleMarkdownChange(e.target.value)}
                placeholder={exampleMarkdown}
                rows={12}
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-slate-800 font-body font-mono text-sm
                           shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08),inset_-3px_-3px_8px_rgba(255,255,255,0.8)]
                           focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                           placeholder:text-slate-300 resize-none"
              />
              <p className="text-xs text-slate-400 mt-1">
                格式：一级标题 (#) 作为项目名，二级标题 (##) 作为板块，列表项 (-) 作为问题
              </p>
            </div>

            {/* Preview */}
            {previewSections.length > 0 && (
              <div className="p-4 rounded-xl bg-white/50">
                <h4 className="font-medium text-slate-700 mb-2 font-heading">
                  提纲预览
                </h4>
                <div className="space-y-2 text-sm">
                  {previewSections.map((section, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-gray-50">
                      <span className="font-medium text-slate-800">{section.title}</span>
                      {section.questions.length > 0 && (
                        <ul className="ml-4 mt-1 text-slate-500">
                          {section.questions.map((q, qi) => (
                            <li key={qi}>• {q}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-lg bg-red-100 text-red-600 text-sm font-body">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600
                       bg-gray-100
                       shadow-[3px_3px_8px_rgba(0,0,0,0.08),-3px_-3px_8px_rgba(255,255,255,0.8)]
                       hover:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08)]
                       disabled:opacity-50
                       transition-all duration-200 cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading || (mode === 'edit' && !markdownContent.trim())}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white
                       bg-gradient-to-r from-blue-500 to-blue-600
                       shadow-[0_4px_12px_rgba(59,130,246,0.3)]
                       hover:shadow-[0_6px_16px_rgba(59,130,246,0.4)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer"
          >
            {loading ? '创建中...' : '创建项目'}
          </button>
        </div>
      </form>
    </div>
  );
}