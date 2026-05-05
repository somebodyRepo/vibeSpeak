import { useState } from 'react';
import { polishTask } from '../../lib/api';
import type { TranscriptionTask, PolishResult, PolishStyle } from '../../types';

interface TranscriptViewerProps {
  task: TranscriptionTask;
}

export function TranscriptViewer({ task }: TranscriptViewerProps) {
  const [polishResult, setPolishResult] = useState<PolishResult | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [style, setStyle] = useState<PolishStyle>('standard');
  const [copied, setCopied] = useState(false);

  const handlePolish = async () => {
    if (!task.raw_text) return;
    setIsPolishing(true);
    try {
      const result = await polishTask(task.id, style, style === 'summary');
      setPolishResult(result);
    } catch (err) {
      alert('润色失败');
    } finally {
      setIsPolishing(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      alert('复制失败，请手动选择文本复制');
    }
  };

  const handleExport = (format: 'txt' | 'md' | 'srt') => {
    let content = '';
    let filename = '';
    const baseName = task.filename.replace(/\.[^/.]+$/, '');

    if (format === 'txt') {
      content = task.raw_text;
      filename = `${baseName}.txt`;
    } else if (format === 'md') {
      content = `# ${task.filename}\n\n`;
      content += `**时长**: ${Math.round(task.duration_s || 0)}秒\n`;
      content += `**状态**: 转写完成\n\n`;
      content += `## 转写内容\n\n${task.raw_text}\n\n`;
      if (polishResult?.polished) {
        content += `## 润色结果\n\n${polishResult.polished}\n\n`;
      }
      filename = `${baseName}.md`;
    } else if (format === 'srt') {
      // Generate SRT subtitle format
      content = task.segments.map((seg, idx) => {
        const start = formatSrtTime(seg.start_ms);
        const end = formatSrtTime(seg.end_ms);
        return `${idx + 1}\n${start} --> ${end}\n${seg.text}\n`;
      }).join('\n');
      filename = `${baseName}.srt`;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatSrtTime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
  };

  const formatTime = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) {
      return `${hours}:${(mins % 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
    }
    return `${mins}:${(secs % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{task.filename}</h3>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            <span className={task.status === 'done' ? 'text-green-400' : ''}>
              {task.status === 'done' ? '✓ 转写完成' : task.status === 'processing' ? '处理中...' : task.status}
            </span>
            {task.duration_s && <span>{Math.round(task.duration_s)}秒</span>}
          </div>
        </div>

        {task.status === 'done' && task.raw_text && (
          <div className="flex gap-2">
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as PolishStyle)}
              className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300"
            >
              <option value="standard">标准润色</option>
              <option value="formal">正式风格</option>
              <option value="concise">精简提炼</option>
              <option value="summary">会议纪要</option>
            </select>
            <button
              onClick={handlePolish}
              disabled={isPolishing}
              className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {isPolishing ? '处理中...' : '润色'}
            </button>
          </div>
        )}
      </div>

      {/* Processing State */}
      {task.status === 'processing' && (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-purple-500" />
          <span className="text-sm">正在转写中，请稍候...</span>
        </div>
      )}

      {/* Error State */}
      {task.status === 'error' && (
        <div className="rounded-lg bg-red-900/20 border border-red-500/30 p-4 text-center">
          <svg className="mx-auto mb-2 h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-red-300">转写失败，请重试</p>
        </div>
      )}

      {/* Full text - Prominent display */}
      {task.raw_text && (
        <div className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">📝 转写结果</span>
            <div className="flex gap-2">
              {/* Copy button */}
              <button
                onClick={() => handleCopy(task.raw_text)}
                className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                {copied ? (
                  <>
                    <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-400">已复制</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    复制全文
                  </>
                )}
              </button>

              {/* Export dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-1.5 rounded-lg bg-purple-600/20 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-600/30">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  导出
                </button>
                <div className="absolute right-0 top-full z-10 mt-1 hidden w-32 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-lg group-hover:block">
                  <button
                    onClick={() => handleExport('txt')}
                    className="block w-full px-4 py-2 text-left text-xs text-gray-300 hover:bg-gray-700"
                  >
                    导出为 TXT
                  </button>
                  <button
                    onClick={() => handleExport('md')}
                    className="block w-full px-4 py-2 text-left text-xs text-gray-300 hover:bg-gray-700"
                  >
                    导出为 Markdown
                  </button>
                  <button
                    onClick={() => handleExport('srt')}
                    className="block w-full px-4 py-2 text-left text-xs text-gray-300 hover:bg-gray-700"
                  >
                    导出为 SRT 字幕
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Text content box */}
          <div className="relative">
            <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
                {task.raw_text}
              </p>
            </div>
            {/* Word count */}
            <div className="absolute bottom-2 right-2 text-xs text-gray-500 bg-gray-900/80 px-2 py-1 rounded">
              {task.raw_text.length} 字符
            </div>
          </div>
        </div>
      )}

      {/* Segments with timestamps */}
      {task.segments.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">⏱️ 时间轴</span>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg bg-gray-800/50 p-3">
            {task.segments.map((seg, idx) => (
              <div key={idx} className="mb-2 flex gap-3 text-sm last:mb-0">
                <span className="flex-shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">
                  {formatTime(seg.start_ms)}
                </span>
                <p className="text-gray-300">{seg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Polish result */}
      {polishResult && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-purple-400">✨ 润色结果</span>
            <button
              onClick={() => handleCopy(polishResult.polished)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600/20 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-600/30"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              复制
            </button>
          </div>
          <div className="rounded bg-gray-900/50 p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
              {polishResult.polished}
            </p>
          </div>
          {polishResult.summary && (
            <div className="mt-4 border-t border-purple-500/20 pt-4">
              <span className="text-xs font-medium text-purple-400">📋 会议纪要</span>
              <div className="mt-2 rounded bg-gray-900/50 p-3">
                <p className="whitespace-pre-wrap text-xs text-gray-300">
                  {polishResult.summary}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
