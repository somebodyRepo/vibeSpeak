import { useRef, useEffect } from 'react';

interface TranscriptItem {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: Date;
}

interface TranscriptStreamProps {
  transcripts: TranscriptItem[];
}

export function TranscriptStream({ transcripts }: TranscriptStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  return (
    <div
      ref={scrollRef}
      className="h-96 overflow-y-auto rounded-xl border border-gray-800 bg-gray-900/50 p-4"
    >
      {transcripts.length === 0 ? (
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
          {transcripts.map((item, index) => (
            <div
              key={item.id}
              className={`rounded-lg p-3 transition-all ${
                item.isFinal
                  ? 'bg-gray-800/50'
                  : 'bg-purple-900/20 border border-purple-500/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs text-gray-300">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p
                    className={`text-sm leading-relaxed ${
                      item.isFinal ? 'text-gray-200' : 'text-purple-200'
                    }`}
                  >
                    {item.text}
                    {!item.isFinal && <span className="cursor-blink"></span>}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {item.timestamp.toLocaleTimeString()}
                    {item.isFinal && (
                      <span className="ml-2 text-green-500">已完成</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
