import { useState } from 'react';
import { exportSessionAudio, exportSessionTranscript, exportSessionExtracted, exportSessionFinal } from '../../lib/api';
import type { Project, InterviewSession, ExportOptions } from '../../types';

interface ExportPanelProps {
  project: Project;
  sessions: InterviewSession[];
  onClose: () => void;
}

export function ExportPanel({ project, sessions, onClose }: ExportPanelProps) {
  const [options, setOptions] = useState<ExportOptions>({
    include_audio: true,
    include_transcript: true,
    include_extracted: true,
    include_final: false,
    audio_format: 'wav',
    transcript_format: 'txt',
    extracted_format: 'json',
    final_format: 'md',
    naming_pattern: '{project}_{session}_{date}_{type}',
  });
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setProgress(0);

    try {
      // 方案1: 使用项目导出 API (如果有后端支持)
      // const blob = await exportProject(project.id);

      // 方案2: 逐个导出并打包
      const files: { name: string; blob: Blob }[] = [];
      const totalSessions = sessions.length;
      let completed = 0;

      for (const session of sessions) {
        const date = new Date(session.created_at).toISOString().split('T')[0];
        const baseName = options.naming_pattern
          .replace('{project}', project.name)
          .replace('{session}', session.filename)
          .replace('{date}', date);

        // 导出音频
        if (options.include_audio) {
          try {
            const audioBlob = await exportSessionAudio(session.id);
            files.push({
              name: `${baseName}_audio.${options.audio_format}`,
              blob: audioBlob,
            });
          } catch {
            // 音频可能不存在
          }
        }

        // 导出转写文本
        if (options.include_transcript && session.raw_transcript) {
          try {
            const transcriptBlob = await exportSessionTranscript(session.id);
            files.push({
              name: `${baseName}_transcript.${options.transcript_format}`,
              blob: transcriptBlob,
            });
          } catch {
            // 转写可能不存在
          }
        }

        // 导出提取信息
        if (options.include_extracted && session.extracted_info) {
          try {
            const extractedBlob = await exportSessionExtracted(session.id);
            files.push({
              name: `${baseName}_extracted.${options.extracted_format}`,
              blob: extractedBlob,
            });
          } catch {
            // 提取信息可能不存在
          }
        }

        // 导出最终内容
        if (options.include_final && session.final_content) {
          try {
            const finalBlob = await exportSessionFinal(session.id);
            files.push({
              name: `${baseName}_final.${options.final_format}`,
              blob: finalBlob,
            });
          } catch {
            // 最终内容可能不存在
          }
        }

        completed++;
        setProgress(Math.round((completed / totalSessions) * 100));
      }

      // 如果有多个文件，打包为 ZIP
      if (files.length > 1) {
        // 使用浏览器原生 API 创建 ZIP（需要 JSZip 库）
        // 这里简化为逐个下载
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
      } else if (files.length === 1) {
        // 单文件直接下载
        const url = URL.createObjectURL(files[0].blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = files[0].name;
        a.click();
        URL.revokeObjectURL(url);
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

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="w-full max-w-lg p-6 rounded-2xl bg-white
                      shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-heading font-semibold text-slate-800">
            批量导出
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
            <span className="text-slate-400">({sessions.length} 个访谈)</span>
          </div>
        </div>

        {/* Export Options */}
        <div className="space-y-4">
          {/* Content Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2 font-body">
              选择导出内容
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={options.include_audio}
                  onChange={(e) => setOptions({ ...options, include_audio: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                />
                <span className="text-sm text-slate-700">原始音频文件 (.wav)</span>
              </label>
              <label className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={options.include_transcript}
                  onChange={(e) => setOptions({ ...options, include_transcript: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                />
                <span className="text-sm text-slate-700">原始转写文本 (.txt)</span>
              </label>
              <label className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={options.include_extracted}
                  onChange={(e) => setOptions({ ...options, include_extracted: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                />
                <span className="text-sm text-slate-700">结构化提取信息 (.json)</span>
              </label>
              <label className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={options.include_final}
                  onChange={(e) => setOptions({ ...options, include_final: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                />
                <span className="text-sm text-slate-700">最终完善内容 (.md)</span>
              </label>
            </div>
          </div>

          {/* Naming Pattern */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2 font-body">
              文件命名规则
            </label>
            <input
              type="text"
              value={options.naming_pattern}
              onChange={(e) => setOptions({ ...options, naming_pattern: e.target.value })}
              placeholder="{project}_{session}_{date}_{type}"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-100 text-slate-700 font-body text-sm
                         shadow-[inset_3px_3px_8px_rgba(0,0,0,0.06)]
                         focus:outline-none focus:ring-2 focus:ring-blue-400
                         placeholder:text-slate-400"
            />
            <p className="mt-1 text-xs text-slate-400">
              可用变量: {'{project}'}, {'{session}'}, {'{date}'}, {'{type}'}
            </p>
          </div>
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
            disabled={exporting || sessions.length === 0}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white
                       bg-gradient-to-r from-blue-500 to-blue-600
                       shadow-[0_4px_12px_rgba(59,130,246,0.3)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       cursor-pointer transition-all"
          >
            {exporting ? '导出中...' : `导出 ${sessions.length} 个访谈`}
          </button>
        </div>
      </div>
    </div>
  );
}