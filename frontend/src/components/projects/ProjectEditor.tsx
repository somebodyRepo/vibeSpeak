import { useState, useEffect } from 'react';
import { createProject, updateProject, listOutlines } from '../../lib/api';
import type { Project, Outline } from '../../types';

interface ProjectEditorProps {
  project?: Project;
  onSave: (project: Project) => void;
  onCancel: () => void;
}

export function ProjectEditor({ project, onSave, onCancel }: ProjectEditorProps) {
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [outlineId, setOutlineId] = useState(project?.outline_id || '');
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!project;

  useEffect(() => {
    listOutlines().then(data => setOutlines(data.outlines));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入项目名称');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = isEditing
        ? await updateProject(project!.id, { name, description, outline_id: outlineId || undefined })
        : await createProject({ name, description, outline_id: outlineId || undefined });
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
      <h2 className="text-xl font-heading font-semibold text-slate-800 mb-6">
        {isEditing ? '编辑项目' : '新建项目'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Project Name */}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1 font-body">
            项目名称 *
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="输入项目名称"
            className="w-full px-4 py-2.5 rounded-xl bg-gray-100 text-slate-800 font-body
                       shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08),inset_-3px_-3px_8px_rgba(255,255,255,0.8)]
                       focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                       placeholder:text-slate-400"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1 font-body">
            项目描述
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="简要描述项目的调研目标和内容"
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl bg-gray-100 text-slate-800 font-body
                       shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08),inset_-3px_-3px_8px_rgba(255,255,255,0.8)]
                       focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                       placeholder:text-slate-400 resize-none"
          />
        </div>

        {/* Outline Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1 font-body">
            关联提纲
          </label>
          <select
            value={outlineId}
            onChange={e => setOutlineId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-gray-100 text-slate-800 font-body
                       shadow-[inset_3px_3px_8px_rgba(0,0,0,0.08),inset_-3px_-3px_8px_rgba(255,255,255,0.8)]
                       focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-50
                       cursor-pointer"
          >
            <option value="">暂不关联提纲</option>
            {outlines.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

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
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600
                       bg-gray-100
                       shadow-[3px_3px_8px_rgba(0,0,0,0.08),-3px_-3px_8px_rgba(255,255,255,0.8)]
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
                       hover:shadow-[0_6px_16px_rgba(59,130,246,0.4)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}
