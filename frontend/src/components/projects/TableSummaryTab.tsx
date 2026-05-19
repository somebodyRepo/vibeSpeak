import { useState, useEffect, useRef } from 'react';
import { TableStructurePromptEditor } from './TableStructurePromptEditor';
import { generateAllTables, getTableGenerationProgress, summarizeTables, exportSummaryTable } from '../../lib/api';
import type { Project, InterviewSession } from '../../types';

interface TableSummaryTabProps {
  project: Project;
  onProjectUpdate: () => void;
  hasCompletedSessions: boolean;
  sessions: InterviewSession[];
}

export function TableSummaryTab({ project, onProjectUpdate, hasCompletedSessions, sessions }: TableSummaryTabProps) {
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [progress, setProgress] = useState<{
    is_running: boolean;
    total_count: number;
    completed_count: number;
    error_count: number;
  } | null>(null);
  const pollingRef = useRef<number | null>(null);

  const hasOutline = !!project.outline_id;
  const hasPrompt = !!project.table_structure_prompt;

  // Calculate pending sessions (done but no table)
  const pendingSessions = sessions.filter(s => s.status === 'done' && !s.table_content).length;
  const tabledSessions = sessions.filter(s => s.status === 'tabled' || s.table_content).length;

  // Poll for progress when generating
  useEffect(() => {
    if (progress?.is_running) {
      pollingRef.current = window.setInterval(async () => {
        try {
          const result = await getTableGenerationProgress(project.id);
          setProgress({
            is_running: result.is_running,
            total_count: result.total_count,
            completed_count: result.completed_count,
            error_count: result.error_count,
          });

          if (!result.is_running) {
            // Refresh project data when done
            onProjectUpdate();
          }
        } catch (err) {
          console.error('Failed to get progress:', err);
        }
      }, 2000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [progress?.is_running, project.id, onProjectUpdate]);

  const handleGenerateAll = async () => {
    if (!hasPrompt) {
      alert('请先设计表格结构提示词');
      return;
    }

    if (pendingSessions === 0) {
      alert('没有需要生成表格的会话');
      return;
    }

    setGenerating(true);
    try {
      const result = await generateAllTables(project.id);
      setProgress({
        is_running: true,
        total_count: result.total_count,
        completed_count: 0,
        error_count: 0,
      });
    } catch (err) {
      alert('启动批量生成失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setGenerating(false);
    }
  };

  const progressPercent = progress
    ? Math.round((progress.completed_count / progress.total_count) * 100)
    : 0;

  const handleSummarize = async () => {
    if (!hasPrompt) {
      alert('请先设计表格结构提示词');
      return;
    }

    if (tabledSessions === 0) {
      alert('没有已生成表格的会话，请先生成表格');
      return;
    }

    setSummarizing(true);
    try {
      await summarizeTables(project.id);
      onProjectUpdate();
    } catch (err) {
      alert('整合汇总失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setSummarizing(false);
    }
  };

  const handleExport = async (format: 'md' | 'xlsx') => {
    if (!project.summary_table) {
      alert('请先整合汇总表格');
      return;
    }

    try {
      const blob = await exportSummaryTable(project.id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}_汇总_${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('导出失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const [showExportMenu, setShowExportMenu] = useState(false);

  // Simple markdown table renderer
  const renderMarkdownTable = (markdown: string) => {
    if (!markdown) return null;

    const lines = markdown.split('\n').filter(line => line.trim().startsWith('|'));
    if (lines.length < 2) return <div className="text-slate-400">{markdown}</div>;

    // Parse header
    const headerCells = lines[0].split('|').filter(c => c.trim()).map(c => c.trim());
    // Skip separator line
    const bodyLines = lines.slice(2);

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-gray-200">
              {headerCells.map((cell, i) => (
                <th key={i} className="px-3 py-2 font-medium text-slate-700 bg-gray-100">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyLines.map((line, rowIndex) => {
              const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
              return (
                <tr key={rowIndex} className="border-b border-gray-100 last:border-0">
                  {cells.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2 text-slate-600">
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Table Structure Prompt Section */}
      <div className="p-6 rounded-2xl bg-gray-100
                      shadow-[inset_5px_5px_15px_rgba(0,0,0,0.05),inset_-5px_-5px_15px_rgba(255,255,255,0.8)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-heading font-semibold text-slate-800">
            表格结构设计
          </h2>
          <button
            onClick={() => setShowPromptEditor(true)}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white
                       bg-gradient-to-r from-blue-500 to-blue-600
                       shadow-[0_4px_12px_rgba(59,130,246,0.3)]
                       hover:shadow-[0_6px_16px_rgba(59,130,246,0.4)]
                       transition-all duration-200 cursor-pointer"
          >
            {hasPrompt ? '编辑表格结构' : '设计表格结构'}
          </button>
        </div>

        {/* Conditions Status */}
        <div className="space-y-2 mb-4">
          <div className={`flex items-center gap-2 text-sm ${hasOutline ? 'text-green-600' : 'text-red-500'}`}>
            <span>{hasOutline ? '✓' : '✗'}</span>
            <span>关联提纲{hasOutline ? '' : '（未满足）'}</span>
          </div>
          <div className={`flex items-center gap-2 text-sm ${hasCompletedSessions ? 'text-green-600' : 'text-red-500'}`}>
            <span>{hasCompletedSessions ? '✓' : '✗'}</span>
            <span>已完成访谈{hasCompletedSessions ? '' : '（未满足）'}</span>
          </div>
        </div>

        {/* Prompt Preview */}
        {hasPrompt ? (
          <div className="p-4 rounded-xl bg-gray-50
                          shadow-[inset_2px_2px_6px_rgba(0,0,0,0.04)]">
            <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {project.table_structure_prompt}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 rounded-xl bg-gray-50
                          shadow-[inset_2px_2px_6px_rgba(0,0,0,0.04)]">
            <p className="text-slate-400 text-sm">
              尚未设计表格结构，请点击上方按钮开始
            </p>
          </div>
        )}
      </div>

      {/* Batch Generation Section */}
      <div className="p-6 rounded-2xl bg-gray-100
                      shadow-[inset_5px_5px_15px_rgba(0,0,0,0.05),inset_-5px_-5px_15px_rgba(255,255,255,0.8)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-heading font-semibold text-slate-800">
            批量生成表格
          </h2>
          <button
            onClick={handleGenerateAll}
            disabled={generating || progress?.is_running || !hasPrompt || pendingSessions === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white
                       bg-gradient-to-r from-green-500 to-green-600
                       shadow-[0_4px_12px_rgba(34,197,94,0.3)]
                       hover:shadow-[0_6px_16px_rgba(34,197,94,0.4)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer"
          >
            {generating || progress?.is_running ? '生成中...' : '生成所有表格'}
          </button>
        </div>

        {/* Session Status Summary */}
        <div className="flex gap-4 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">待生成:</span>
            <span className="font-medium text-blue-600">{pendingSessions}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">已生成:</span>
            <span className="font-medium text-green-600">{tabledSessions}</span>
          </div>
        </div>

        {/* Progress Bar */}
        {progress && progress.total_count > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>进度: {progress.completed_count}/{progress.total_count}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-500
                           transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {progress.error_count > 0 && (
              <div className="text-sm text-red-500">
                ⚠️ {progress.error_count} 个会话生成失败
              </div>
            )}
            {!progress.is_running && progress.completed_count > 0 && (
              <div className="text-sm text-green-600">
                ✓ 批量生成完成
              </div>
            )}
          </div>
        )}

        {/* No pending message */}
        {!progress?.is_running && pendingSessions === 0 && tabledSessions > 0 && (
          <div className="p-3 rounded-xl bg-green-50 text-sm text-green-700 text-center">
            所有访谈已生成表格
          </div>
        )}
      </div>

      {/* Summary Table Section */}
      <div className="p-6 rounded-2xl bg-gray-100
                      shadow-[inset_5px_5px_15px_rgba(0,0,0,0.05),inset_-5px_-5px_15px_rgba(255,255,255,0.8)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-heading font-semibold text-slate-800">
            汇总表格
          </h2>
          <div className="flex gap-2">
            {/* Export Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={!project.summary_table}
                className="px-3 py-2 rounded-xl text-sm font-medium text-slate-600
                           bg-gray-200 hover:bg-gray-300
                           disabled:opacity-50 disabled:cursor-not-allowed
                           cursor-pointer transition-colors"
              >
                导出 ▾
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                  <button
                    onClick={() => { handleExport('md'); setShowExportMenu(false); }}
                    className="block w-full px-4 py-2 text-sm text-left text-slate-700
                               hover:bg-gray-100 cursor-pointer"
                  >
                    Markdown
                  </button>
                  <button
                    onClick={() => { handleExport('xlsx'); setShowExportMenu(false); }}
                    className="block w-full px-4 py-2 text-sm text-left text-slate-700
                               hover:bg-gray-100 cursor-pointer"
                  >
                    Excel
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleSummarize}
              disabled={summarizing || !hasPrompt || tabledSessions === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white
                         bg-gradient-to-r from-purple-500 to-purple-600
                         shadow-[0_4px_12px_rgba(147,51,234,0.3)]
                         hover:shadow-[0_6px_16px_rgba(147,51,234,0.4)]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 cursor-pointer"
            >
              {summarizing ? '整合中...' : '整合汇总表格'}
            </button>
          </div>
        </div>

        {/* Session count info */}
        <div className="flex gap-4 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">参与整合:</span>
            <span className="font-medium text-purple-600">{tabledSessions} 个访谈</span>
          </div>
        </div>

        {/* Summary Table Preview */}
        {project.summary_table ? (
          <div className="p-4 rounded-xl bg-gray-50
                          shadow-[inset_2px_2px_6px_rgba(0,0,0,0.04)]">
            {renderMarkdownTable(project.summary_table)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 rounded-xl bg-gray-50
                          shadow-[inset_2px_2px_6px_rgba(0,0,0,0.04)]">
            <p className="text-slate-400 text-sm">
              {tabledSessions > 0 ? '点击上方按钮整合汇总表格' : '请先生成各访谈表格'}
            </p>
          </div>
        )}
      </div>

      {/* Prompt Editor Modal */}
      {showPromptEditor && (
        <TableStructurePromptEditor
          projectId={project.id}
          hasOutline={hasOutline}
          hasCompletedSessions={hasCompletedSessions}
          onClose={() => setShowPromptEditor(false)}
          onSave={() => {
            setShowPromptEditor(false);
            onProjectUpdate();
          }}
        />
      )}
    </div>
  );
}