import { useCallback, useState } from 'react';

interface FileUploaderProps {
  onUpload: (files: File[]) => void;
  uploadProgress: { [key: string]: number };
}

export function FileUploader({ onUpload, uploadProgress }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((file) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        return ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'webm'].includes(ext || '');
      });

      if (files.length > 0) {
        onUpload(files);
      }
    },
    [onUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) {
        onUpload(files);
      }
    },
    [onUpload]
  );

  const hasActiveUploads = Object.keys(uploadProgress).length > 0;

  return (
    <div className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? 'border-purple-500 bg-purple-500/10'
            : 'border-gray-700 bg-gray-900/30 hover:border-gray-600'
        }`}
      >
        <input
          type="file"
          accept=".wav,.mp3,.m4a,.flac,.ogg,.webm"
          multiple
          onChange={handleFileSelect}
          className="absolute inset-0 cursor-pointer opacity-0"
        />

        <svg
          className={`mx-auto mb-3 h-10 w-10 ${isDragging ? 'text-purple-400' : 'text-gray-500'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        <p className="text-sm text-gray-300">
          拖拽音频文件到此处，或 <span className="text-purple-400">点击上传</span>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          支持 WAV, MP3, M4A, FLAC, OGG 格式
        </p>
      </div>

      {/* Upload Progress */}
      {hasActiveUploads && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([id, progress]) => (
            <div key={id} className="rounded-lg bg-gray-800 p-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-gray-300 truncate max-w-[200px]">{id.split('-')[0]}</span>
                <span className="text-purple-400">{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-700">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
