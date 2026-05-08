import { useState, useEffect, useCallback } from 'react';
import { listProjects, deleteProject } from '../../lib/api';
import type { Project } from '../../types';

interface ProjectListProps {
  onSelect: (project: Project) => void;
  onNewProject: () => void;
}

export function ProjectList({ onSelect, onNewProject }: ProjectListProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const data = await listProjects();
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDelete = async (projectId: string, projectName: string) => {
    if (!confirm(`确定要删除项目 "${projectName}" 吗？\n关联的访谈记录也将被删除。`)) return;
    try {
      await deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-red-50 text-red-600">
        {error}
        <button onClick={loadProjects} className="ml-4 underline">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold text-slate-800">
            调研项目
          </h1>
          <p className="mt-1 text-sm text-slate-500 font-body">
            管理您的调研项目和访谈记录
          </p>
        </div>
        <button
          onClick={onNewProject}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white
                     bg-gradient-to-r from-blue-500 to-blue-600
                     shadow-[0_4px_12px_rgba(59,130,246,0.3)]
                     hover:shadow-[0_6px_20px_rgba(59,130,246,0.4)]
                     transition-all duration-200 cursor-pointer"
        >
          + 新建项目
        </button>
      </div>

      {/* Project Cards Grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-2xl
                        bg-gray-100 text-gray-500">
          <div className="w-16 h-16 mb-4 rounded-full bg-gray-200 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="text-base font-medium text-gray-400">暂无项目</p>
          <p className="mt-1 text-sm text-gray-400">点击上方按钮创建第一个调研项目</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(project => (
            <div
              key={project.id}
              className="p-5 rounded-2xl cursor-pointer transition-all duration-200
                         bg-gray-100
                         shadow-[5px_5px_15px_rgba(0,0,0,0.08),-5px_-5px_15px_rgba(255,255,255,0.8)]
                         hover:shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
            >
              {/* Project Icon */}
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-500
                                flex items-center justify-center text-white text-lg">
                  📋
                </div>
                <span className="text-xs text-slate-400 font-body">
                  {project.session_count} 个访谈
                </span>
              </div>

              {/* Project Info */}
              <h3 className="font-heading font-medium text-slate-800 text-lg mb-1">
                {project.name}
              </h3>
              <p className="text-sm text-slate-500 font-body line-clamp-2 mb-4">
                {project.description || '暂无描述'}
              </p>

              {/* Outline Badge */}
              {project.outline && (
                <div className="inline-block px-2 py-0.5 rounded-lg text-xs
                                bg-purple-100 text-purple-600 mb-4">
                  {project.outline.name}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-3 border-t border-gray-200">
                <button
                  onClick={() => onSelect(project)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium
                             text-blue-600 bg-blue-50 hover:bg-blue-100
                             transition-colors cursor-pointer"
                >
                  进入
                </button>
                <button
                  onClick={() => handleDelete(project.id, project.name)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium
                             text-red-500 bg-red-50 hover:bg-red-100
                             transition-colors cursor-pointer"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
