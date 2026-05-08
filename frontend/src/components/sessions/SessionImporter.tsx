import { useState, useRef } from 'react';
import { createSession, batchImportSessions } from '../../lib/api';

interface SessionImporterProps {
  projectId: string;
  onComplete: () => void;
  onClose: () => void;
}

export function SessionImporter({ projectId, onComplete, onClose }: SessionImporterProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'webm'].includes(ext || '');
    });
    setFiles(validFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setProgress(0);

    try {
      if (files.length === 1) {
        // 单文件上传
        await createSession(projectId, files[0]);
        setProgress(100);
      } else {
        // 批量上传 - 顺序处理
        for (let i = 0; i < files.length; i++) {
          await createSession(projectId, files[i]);
          setProgress(Math.round(((i + 1) / files.length) * 100));
        }
      }

      onComplete();
      onClose();
    } catch (err) {
      alert('上传失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="w-full max-w-md p-6 rounded-2xl bg-white
                      shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
        <h2 className="text-xl font-heading font-semibold text-slate-800 mb-4">
          导入音频文件
        </h2>

        {/* File Drop Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="p-8 border-2 border-dashed border-gray-300 rounded-xl
                     text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50
                     transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,.webm"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-sm text-slate-600 font-body">
            点击选择或拖拽音频文件
          </p>
          <p className="text-xs text-slate-400 mt-1">
            支持 WAV, MP3, M4A, FLAC, OGG, WebM
          </p>
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-gray-50">
            <p className="text-sm font-medium text-slate-600 mb-2">
              已选择 {files.length} 个文件:
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="w-4 h-4 rounded bg-blue-100 text-blue-500 flex items-center justify-center text-[10px]">
                    ✓
                  </span>
                  <span className="truncate">{file.name}</span>
                  <span className="text-slate-400">
                    ({(file.size / 1024 / 1024).toFixed(1)}MB)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress */}
        {uploading && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>上传中...</span>
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
            disabled={uploading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600
                       bg-gray-100 hover:bg-gray-200
                       disabled:opacity-50 cursor-pointer transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white
                       bg-gradient-to-r from-blue-500 to-blue-600
                       shadow-[0_4px_12px_rgba(59,130,246,0.3)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       cursor-pointer transition-all"
          >
            {uploading ? '上传中...' : `上传 ${files.length} 个文件`}
          </button>
        </div>
      </div>
    </div>
  );
}
