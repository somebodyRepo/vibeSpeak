import { useState, useEffect } from 'react';
import { createOutline, updateOutline, importOutline } from '../../lib/api';
import type { Outline, OutlineContent, OutlineSection } from '../../types';

interface OutlineEditorProps {
  outline?: Outline;
  onSave: (outline: Outline) => void;
  onCancel: () => void;
}

export function OutlineEditor({ outline, onSave, onCancel }: OutlineEditorProps) {
  const [name, setName] = useState(outline?.name || '');
  const [sections, setSections] = useState<OutlineSection[]>(
    outline?.content?.sections || [{ id: 's1', title: '基本信息', questions: [''] }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFormat, setImportFormat] = useState<'json' | 'markdown'>('json');

  const isEditing = !!outline;

  const addSection = () => {
    setSections(prev => [
      ...prev,
      { id: `s${Date.now()}`, title: '', questions: [''] }
    ]);
  };

  const updateSection = (index: number, data: Partial<OutlineSection>) => {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, ...data } : s));
  };

  const removeSection = (index: number) => {
    setSections(prev => prev.filter((_, i) => i !== index));
  };

  const addQuestion = (sectionIndex: number) => {
    setSections(prev => prev.map((s, i) =>
      i === sectionIndex ? { ...s, questions: [...s.questions, ''] } : s
    ));
  };

  const updateQuestion = (sectionIndex: number, qIndex: number, value: string) => {
    setSections(prev => prev.map((s, i) =>
      i === sectionIndex
        ? { ...s, questions: s.questions.map((q, qi) => qi === qIndex ? value : q) }
        : s
    ));
  };

  const removeQuestion = (sectionIndex: number, qIndex: number) => {
    setSections(prev => prev.map((s, i) =>
      i === sectionIndex
        ? { ...s, questions: s.questions.filter((_, qi) => qi !== qIndex) }
        : s
    ));
  };

  const handleImport = async () => {
    if (!name.trim()) {
      setError('请输入提纲名称');
      return;
    }
    if (!importText.trim()) {
      setError('请输入要导入的内容');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await importOutline({ name, format: importFormat, content: importText });
      onSave(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入提纲名称');
      return;
    }

    // 过滤空问题
    const cleanedSections = sections.map(s => ({
      ...s,
      questions: s.questions.filter(q => q.trim())
    })).filter(s => s.title.trim());

    if (cleanedSections.length === 0) {
      setError('请至少添加一个板块');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const content: OutlineContent = { sections: cleanedSections };
      const data = isEditing
        ? await updateOutline(outline!.id, { name, content })
        : await createOutline({ name, content });
      onSave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-gray-100
                    shadow-[inset_5px_5px_15px_rgba(0,0,0,0.05),inset_-5px_-5px_15px_rgba(255,255,255,0.8)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-heading font-semibold text-slate-800">
          {isEditing ? '编辑提纲' : '新建提纲'}
        </h2>
        <button
          type="button"
          onClick={() => setShowImport(!showImport)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-purple-600
                     bg-purple-50 hover:bg-purple-100 transition-colors cursor-pointer"
        >
          {showImport ? '返回编辑' : '导入提纲'}
        </button>
      </div>

      {showImport ? (
        <div className="space-y-4">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1 font-body">
              导入格式
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setImportFormat('json')}
                className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors
                           ${importFormat === 'json'
                             ? 'bg-blue-500 text-white'
                             : 'bg-gray-200 text-slate-600 hover:bg-gray-300'}`}
              >
                JSON
              </button>
              <button
                onClick={() => setImportFormat('markdown')}
                className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors
                           ${importFormat === 'markdown'
                             ? 'bg-blue-500 text-white'
                             : 'bg-gray-200 text-slate-600 hover:bg-gray-300'}`}
              >
                Markdown
              </button>
            </div>
          </div>

          {/* Import Content */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1 font-body">
              提纲内容
            </label>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={importFormat === 'json'
                ? '{\n  "sections": [\n    {"title": "板块名", "questions": ["问题1", "问题2"]}\n  ]\n}'
                : '# 板块名称\n- 问题1\n- 问题2'}
              rows={10}
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-slate-800 font-body font-mono text-sm
                         shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08),inset_-3px_-3px_8px_rgba(255,255,255,0.8)]
                         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                         placeholder:text-slate-400 resize-none"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-100 text-red-600 text-sm font-body">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600
                         bg-gray-100 shadow-[3px_3px_8px_rgba(0,0,0,0.08),-3px_-3px_8px_rgba(255,255,255,0.8)]
                         hover:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08)]
                         transition-all duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white
                         bg-gradient-to-r from-purple-500 to-purple-600
                         shadow-[0_4px_12px_rgba(168,85,247,0.3)]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 cursor-pointer"
            >
              {loading ? '导入中...' : '导入'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Outline Name */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1 font-body">
              提纲名称 *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="输入提纲名称"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-100 text-slate-800 font-body
                         shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08),inset_-3px_-3px_8px_rgba(255,255,255,0.8)]
                         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                         placeholder:text-slate-400"
            />
          </div>

          {/* Sections */}
          <div className="space-y-4">
            {sections.map((section, sIndex) => (
              <div
                key={section.id}
                className="p-4 rounded-xl bg-gray-50
                           shadow-[inset_2px_2px_6px_rgba(0,0,0,0.05)]"
              >
                {/* Section Header */}
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={section.title}
                    onChange={e => updateSection(sIndex, { title: e.target.value })}
                    placeholder="板块名称"
                    className="flex-1 px-3 py-2 rounded-lg bg-gray-100 text-slate-700 font-body text-sm
                               shadow-[inset_2px_2px_4px_rgba(0,0,0,0.08),inset_-2px_-2px_4px_rgba(255,255,255,0.8)]
                               focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                               placeholder:text-slate-400"
                  />
                  {sections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSection(sIndex)}
                      className="p-2 rounded-lg text-red-500 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M3 20h18" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Questions */}
                <div className="space-y-2">
                  {section.questions.map((question, qIndex) => (
                    <div key={qIndex} className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">•</span>
                      <input
                        type="text"
                        value={question}
                        onChange={e => updateQuestion(sIndex, qIndex, e.target.value)}
                        placeholder="问题内容"
                        className="flex-1 px-3 py-1.5 rounded-lg bg-gray-100 text-slate-600 font-body text-sm
                                   shadow-[inset_2px_2px_4px_rgba(0,0,0,0.06),inset_-2px_-2px_4px_rgba(255,255,255,0.7)]
                                   focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                                   placeholder:text-slate-400"
                      />
                      {section.questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(sIndex, qIndex)}
                          className="p-1 rounded text-red-400 hover:text-red-600 cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addQuestion(sIndex)}
                    className="text-sm text-blue-500 hover:text-blue-600 font-medium cursor-pointer"
                  >
                    + 添加问题
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add Section Button */}
          <button
            type="button"
            onClick={addSection}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-blue-600
                       bg-blue-50 hover:bg-blue-100 border-2 border-dashed border-blue-200
                       transition-colors cursor-pointer"
          >
            + 添加板块
          </button>

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
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600
                         bg-gray-100 shadow-[3px_3px_8px_rgba(0,0,0,0.08),-3px_-3px_8px_rgba(255,255,255,0.8)]
                         hover:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08)]
                         transition-all duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white
                         bg-gradient-to-r from-blue-500 to-blue-600
                         shadow-[0_4px_12px_rgba(59,130,246,0.3)]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 cursor-pointer"
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
