import { useState, useCallback } from 'react';
import { polishText } from '../../lib/api';
import type { PolishStyle, PolishResult } from '../../types';

interface PolishPanelProps {
  originalText: string;
}

export function PolishPanel({ originalText }: PolishPanelProps) {
  const [style, setStyle] = useState<PolishStyle>('standard');
  const [result, setResult] = useState<PolishResult | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePolish = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setStreamingText('');
    setResult(null);

    try {
      const polished = await polishText(originalText, style);
      setResult(polished);
    } catch (err) {
      setError(err instanceof Error ? err.message : '润色失败');
    } finally {
      setIsLoading(false);
    }
  }, [originalText, style]);


  const styleOptions: { value: PolishStyle; label: string; description: string }[] = [
    { value: 'standard', label: '标准润色', description: '纠错 + 书面化' },
    { value: 'formal', label: '正式风格', description: '适合公文报告' },
    { value: 'concise', label: '精简提炼', description: '提取要点' },
    { value: 'summary', label: '会议纪要', description: '生成会议摘要' },
  ];

  const displayText = result?.polished || streamingText;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-white">AI 润色</h3>
        <div className="flex gap-2">
          <button
            onClick={handlePolish}
            disabled={isLoading}
            className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
          >
            {isLoading ? '处理中...' : '润色'}
          </button>
        </div>
      </div>

      {/* Style Selector */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {styleOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStyle(opt.value)}
            className={`rounded-lg border p-2 text-left text-xs transition-colors ${
              style === opt.value
                ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <div className="font-medium">{opt.label}</div>
            <div className="mt-0.5 text-[10px] opacity-70">{opt.description}</div>
          </button>
        ))}
      </div>

      {/* Result */}
      {error && (
        <div className="mb-3 rounded-lg bg-red-900/30 border border-red-500/30 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {(displayText || isLoading) && (
        <div className="rounded-lg bg-gray-800/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">润色结果</span>
            <button
              onClick={() => navigator.clipboard.writeText(displayText)}
              className="text-xs text-purple-400 hover:text-purple-300"
            >
              复制
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
              {displayText || (isLoading ? '思考中...' : '')}
              {isLoading && !streamingText && (
                <span className="inline-flex ml-1">
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>.</span>
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {result?.summary && (
        <div className="mt-3 rounded-lg bg-blue-900/20 border border-blue-500/30 p-3">
          <div className="mb-1 text-xs font-medium text-blue-400">会议纪要</div>
          <div className="text-xs text-gray-300 whitespace-pre-wrap">{result.summary}</div>
        </div>
      )}
    </div>
  );
}
