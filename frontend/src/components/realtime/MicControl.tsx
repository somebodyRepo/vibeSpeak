interface MicControlProps {
  isRecording: boolean;
  isConnecting: boolean;
  onToggle: () => void;
}

export function MicControl({ isRecording, isConnecting, onToggle }: MicControlProps) {
  return (
    <button
      onClick={onToggle}
      disabled={isConnecting}
      className={`group relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 ${
        isRecording
          ? 'animate-pulse-red bg-red-600 hover:bg-red-700'
          : 'bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500'
      } ${isConnecting ? 'opacity-70 cursor-wait' : ''}`}
    >
      {isConnecting ? (
        <svg
          className="h-7 w-7 animate-spin text-white"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : isRecording ? (
        <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg
          className="h-7 w-7 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      )}

      {/* Ring effect when recording */}
      {isRecording && (
        <>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-20"></span>
          <span className="absolute -inset-2 rounded-full border border-red-500/30"></span>
        </>
      )}
    </button>
  );
}
