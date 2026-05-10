import { useState } from 'react';
import { exportSessionExtracted, exportSessionFinal } from '../../lib/api';
import type { Project, InterviewSession } from '../../types';

interface ExportPanelProps {
  project: Project;
  sessions: InterviewSession[];
  onClose: () => void;
}

export function ExportPanel({ project, sessions, onClose }: ExportPanelProps) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setProgress(0);

    try {
      const files: { name: string; blob: Blob }[] = [];
      const totalSessions = sessions.length;
      let completed = 0;

      for (const session of sessions) {
        const date = new Date(session.created_at).toISOString().split('T')[0];
        const baseName = `${project.name}_${session.filename}_${date}`;

        // 导出提取信息 (Markdown)
        if (session.extracted_info) {
          try {
            const extractedBlob = await exportSessionExtracted(session.id);
            files.push({
              name: `${baseName}_extracted.md`,
              blob: extractedBlob,
            });
          } catch {
            // 提取信息可能不存在
          }
        }

        // 导出最终内容 (Markdown)
        if (session.final_content) {
          try {
            const finalBlob = await exportSessionFinal(session.id);
            files.push({
              name: `${baseName}_final.md`,
              blob: finalBlob,
            });
          } catch {
            // 最终内容可能不存在
          }
        }

        completed++;
        setProgress(Math.round((completed / totalSessions) * 100));
      }

      // 逐个下载文件
      for (const file of files) {
        const url = URL.createObjectURL(file.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        // 等待一下避免浏览器阻止
        await new Promise((r) => setTimeout(r, 100));
      }

      setProgress(100);
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const validSessions = sessions.filter(s => s.extracted_info || s.final_content);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="w-full max-w-lg p-6 rounded-2xl bg-white
                      shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-heading font-semibold text-slate-800">
            批量导出 Markdown
          </h2>
          <button
            onClick={onClose}
            disabled={exporting}
            className="p-2 rounded-lg text-slate-400 hover:bg-gray-100
                       disabled:opacity-50 cursor-pointer transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Project Info */}
        <div className="mb-4 p-3 rounded-xl bg-gray-100 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">{project.name}</span>
            <span className="text-slate-400">({validSessions.length} 个可导出)</span>
          </div>
        </div>

        {/* Export Info */}
        <div className="mb-4 p-4 rounded-xl bg-blue-50 text-sm text-slate-600">
          <p className="font-medium mb-2">将导出以下内容：</p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>提取信息 (extracted.md)</li>
            <li>最终内容 (final.md)</li>
          </ul>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-100 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Progress */}
        {exporting && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>导出中...</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={exporting}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600
                       bg-gray-100 hover:bg-gray-200
                       disabled:opacity-50 cursor-pointer transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || validSessions.length === 0}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white
                       bg-gradient-to-r from-blue-500 to-blue-600
                       shadow-[0_4px_12px_rgba(59,130,246,0.3)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       cursor-pointer transition-all"
          >
            {exporting ? '导出中...' : `导出 ${validSessions.length} 个访谈`}
          </button>
        </div>
      </div>
    </div>
  );
}
