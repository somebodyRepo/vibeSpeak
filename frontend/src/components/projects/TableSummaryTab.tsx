import React, { useState, useEffect, useRef } from 'react';
import { generateAllTables, getTableGenerationProgress, summarizeTables, exportSummaryTable, getSessionTable } from '../../lib/api';
import type { Project, InterviewSession } from '../../types';
import { PromptEditor } from './PromptEditor';

interface TableSummaryTabProps {
  project: Project;
  onProjectUpdate: () => void;
  sessions: InterviewSession[];
}

export function TableSummaryTab({ project, onProjectUpdate, sessions }: TableSummaryTabProps) {
  const [generating, setGenerating] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [progress, setProgress] = useState<{
    is_running: boolean;
    total_count: number;
    completed_count: number;
    error_count: number;
  } | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionContents, setSessionContents] = useState<Record<string, string>>({});
  const pollingRef = useRef<number | null>(null);

  // Calculate pending sessions (done but no table)
  const pendingSessions = sessions.filter(s => s.status === 'done' && !s.table_content);
  const tabledSessions = sessions.filter(s => s.status === 'tabled' || s.table_content);

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
    // Check if prompt template exists
    if (!project.table_structure_prompt) {
      setShowPromptEditor(true);
      return;
    }

    if (pendingSessions.length === 0) {
      alert('没有需要生成文档的会话');
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
    if (tabledSessions.length === 0) {
      alert('没有已生成文档的会话，请先生成文档');
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

  const handleExport = async () => {
    if (!project.summary_table) {
      alert('请先生成汇总报告');
      return;
    }

    try {
      const blob = await exportSummaryTable(project.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}_汇总报告_${new Date().toISOString().split('T')[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('导出失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // Load session table content when expanded
  const handleExpandSession = async (sessionId: string) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }

    setExpandedSessionId(sessionId);

    // Load content if not cached
    if (!sessionContents[sessionId]) {
      try {
        const result = await getSessionTable(sessionId);
        setSessionContents(prev => ({
          ...prev,
          [sessionId]: result.table_content || ''
        }));
      } catch (err) {
        console.error('Failed to load session table:', err);
      }
    }
  };

  const handlePromptSaved = () => {
    onProjectUpdate();
    // Auto-start generation after prompt is saved
    handleGenerateAll();
  };

  // Simple markdown renderer
  const renderMarkdown = (markdown: string) => {
    if (!markdown) return <span className="text-slate-400">无内容</span>;

    // Basic rendering - preserve line breaks and headers
    const lines = markdown.split('\n');
    const elements: React.ReactNode[] = [];
    let currentParagraph: string[] = [];
    let inTable = false;
    let tableLines: string[] = [];

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        elements.push(
          <p key={`p-${elements.length}`} className="mb-2 text-slate-700">
            {currentParagraph.join('\n')}
          </p>
        );
        currentParagraph = [];
      }
    };

    for (const line of lines) {
      // Table detection
      if (line.trim().startsWith('|')) {
        if (!inTable) {
          flushParagraph();
          inTable = true;
          tableLines = [];
        }
        tableLines.push(line);
      } else {
        if (inTable) {
          // Render table
          elements.push(
            <div key={`table-${elements.length}`} className="overflow-x-auto mb-4">
              {renderMarkdownTable(tableLines.join('\n'))}
            </div>
          );
          inTable = false;
          tableLines = [];
        }

        if (line.startsWith('## ')) {
          flushParagraph();
          elements.push(
            <h3 key={`h3-${elements.length}`} className="text-lg font-semibold text-slate-800 mt-4 mb-2">
              {line.slice(3)}
            </h3>
          );
        } else if (line.startsWith('### ')) {
          flushParagraph();
          elements.push(
            <h4 key={`h4-${elements.length}`} className="text-base font-semibold text-slate-700 mt-3 mb-2">
              {line.slice(4)}
            </h4>
          );
        } else if (line.startsWith('- ')) {
          flushParagraph();
          elements.push(
            <li key={`li-${elements.length}`} className="ml-4 text-slate-700">
              {line.slice(2)}
            </li>
          );
        } else if (line.trim() === '') {
          flushParagraph();
        } else {
          currentParagraph.push(line);
        }
      }
    }

    if (inTable && tableLines.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="overflow-x-auto mb-4">
          {renderMarkdownTable(tableLines.join('\n'))}
        </div>
      );
    }

    flushParagraph();

    return <>{elements}</>;
  };

  // Simple markdown table renderer
  const renderMarkdownTable = (markdown: string) => {
    if (!markdown) return null;

    const lines = markdown.split('\n').filter(line => line.trim().startsWith('|'));
    if (lines.length < 2) return <div className="text-slate-400 whitespace-pre-wrap">{markdown}</div>;

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
      {/* Prompt Editor Modal */}
      {showPromptEditor && (
        <PromptEditor
          projectId={project.id}
          onComplete={handlePromptSaved}
          onClose={() => setShowPromptEditor(false)}
        />
      )}

      {/* Batch Generation Section */}
      <div className="p-6 rounded-2xl bg-gray-100
                      shadow-[inset_5px_5px_15px_rgba(0,0,0,0.05),inset_-5px_-5px_15px_rgba(255,255,255,0.8)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-heading font-semibold text-slate-800">
            批量生成文档
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPromptEditor(true)}
              className="px-3 py-2 rounded-xl text-sm font-medium text-slate-600
                         bg-gray-200 hover:bg-gray-300
                         cursor-pointer transition-colors"
            >
              编辑模板
            </button>
            <button
              onClick={handleGenerateAll}
              disabled={generating || progress?.is_running || pendingSessions.length === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white
                         bg-gradient-to-r from-green-500 to-green-600
                         shadow-[0_4px_12px_rgba(34,197,94,0.3)]
                         hover:shadow-[0_6px_16px_rgba(34,197,94,0.4)]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 cursor-pointer"
            >
              {generating || progress?.is_running ? '生成中...' : '生成所有文档'}
            </button>
          </div>
        </div>

        {/* Prompt status */}
        {!project.table_structure_prompt && (
          <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 mb-4 text-sm text-orange-700">
            ⚠️ 尚未设置提示词模板，点击"生成所有文档"将自动生成模板
          </div>
        )}

        {/* Session Status Summary */}
        <div className="flex gap-4 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">待生成:</span>
            <span className="font-medium text-blue-600">{pendingSessions.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">已生成:</span>
            <span className="font-medium text-green-600">{tabledSessions.length}</span>
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
        {!progress?.is_running && pendingSessions.length === 0 && tabledSessions.length > 0 && (
          <div className="p-3 rounded-xl bg-green-50 text-sm text-green-700 text-center">
            所有访谈已生成文档
          </div>
        )}
      </div>

      {/* Generated Documents List */}
      {tabledSessions.length > 0 && (
        <div className="p-6 rounded-2xl bg-gray-100
                        shadow-[inset_5px_5px_15px_rgba(0,0,0,0.05),inset_-5px_-5px_15px_rgba(255,255,255,0.8)]">
          <h2 className="text-xl font-heading font-semibold text-slate-800 mb-4">
            已生成文档
          </h2>

          <div className="space-y-3">
            {tabledSessions.map(session => (
              <div key={session.id}
                   className="rounded-xl bg-white border border-gray-200 overflow-hidden
                              shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                {/* Session Header */}
                <button
                  onClick={() => handleExpandSession(session.id)}
                  className="w-full flex items-center justify-between p-4
                             hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-800">{session.filename}</div>
                      <div className="text-xs text-slate-400">
                        {session.duration_s ? `${Math.round(session.duration_s / 60)} 分钟` : '时长未知'}
                      </div>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${
                      expandedSessionId === session.id ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded Content */}
                {expandedSessionId === session.id && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="mt-4 p-4 rounded-xl bg-gray-50 max-h-96 overflow-y-auto">
                      {renderMarkdown(sessionContents[session.id] || session.table_content || '加载中...')}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Report Section */}
      <div className="p-6 rounded-2xl bg-gray-100
                      shadow-[inset_5px_5px_15px_rgba(0,0,0,0.05),inset_-5px_-5px_15px_rgba(255,255,255,0.8)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-heading font-semibold text-slate-800">
            汇总报告
          </h2>
          <div className="flex gap-2">
            {/* Export Dropdown */}
            <button
              onClick={handleExport}
              disabled={!project.summary_table}
              className="px-3 py-2 rounded-xl text-sm font-medium text-slate-600
                         bg-gray-200 hover:bg-gray-300
                         disabled:opacity-50 disabled:cursor-not-allowed
                         cursor-pointer transition-colors"
            >
              导出 Markdown
            </button>
            <button
              onClick={handleSummarize}
              disabled={summarizing || tabledSessions.length === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white
                         bg-gradient-to-r from-purple-500 to-purple-600
                         shadow-[0_4px_12px_rgba(147,51,234,0.3)]
                         hover:shadow-[0_6px_16px_rgba(147,51,234,0.4)]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 cursor-pointer"
            >
              {summarizing ? '整合中...' : '生成汇总报告'}
            </button>
          </div>
        </div>

        {/* Session count info */}
        <div className="flex gap-4 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">参与整合:</span>
            <span className="font-medium text-purple-600">{tabledSessions.length} 个访谈</span>
          </div>
        </div>

        {/* Summary Report Preview */}
        {project.summary_table ? (
          <div className="p-4 rounded-xl bg-gray-50
                          shadow-[inset_2px_2px_6px_rgba(0,0,0,0.04)] max-h-96 overflow-y-auto">
            {renderMarkdown(project.summary_table)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 rounded-xl bg-gray-50
                          shadow-[inset_2px_2px_6px_rgba(0,0,0,0.04)]">
            <p className="text-slate-400 text-sm">
              {tabledSessions.length > 0 ? '点击上方按钮生成汇总报告' : '请先生成各访谈文档'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}