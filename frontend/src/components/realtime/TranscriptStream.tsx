import { useRef, useEffect } from 'react';

interface TranscriptStreamProps {
  // 已确认的文本（之前的内容）
  confirmedText: string;
  // 当前正在识别的片段（实时更新）
  currentSegment: string;
  // 最终完整文本
  finalText: string;
}

export function TranscriptStream({
  confirmedText,
  currentSegment,
  finalText,
}: TranscriptStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [finalText, currentSegment]);

  // 计算显示内容
  const hasContent = finalText || currentSegment || confirmedText;

  return (
    <div
      ref={scrollRef}
      className="h-96 overflow-y-auto rounded-xl border border-gray-800 bg-gray-900/50 p-4"
    >
      {!hasContent ? (
        <div className="flex h-full flex-col items-center justify-center text-gray-500">
          <svg
            className="mb-3 h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p className="text-sm">点击麦克风开始说话...</p>
          <p className="mt-1 text-xs text-gray-600">支持普通话和四川方言</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 已确认的文本 */}
          {confirmedText && !finalText && (
            <div className="rounded-lg bg-gray-800/50 p-3">
              <p className="text-sm leading-relaxed text-gray-200 whitespace-pre-wrap">
                {confirmedText}
              </p>
            </div>
          )}

          {/* 当前正在识别的片段 */}
          {currentSegment && !finalText && (
            <div className="rounded-lg bg-purple-900/20 border border-purple-500/30 p-3">
              <p className="text-sm leading-relaxed text-purple-200">
                {currentSegment}
                <span className="inline-block w-0.5 h-4 ml-0.5 bg-purple-400 animate-pulse"></span>
              </p>
            </div>
          )}

          {/* 最终完整文本 */}
          {finalText && (
            <div className="rounded-lg bg-gray-800/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-400">
                  <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  转写完成
                </span>
              </div>
              <p className="text-sm leading-relaxed text-gray-200 whitespace-pre-wrap">
                {finalText}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
