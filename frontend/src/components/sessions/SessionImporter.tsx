import { useState, useRef } from 'react';
import { getAuthHeaders } from '../../lib/auth';
import { getApiBase } from '../../lib/config';

interface SessionImporterProps {
  projectId: string;
  onComplete: () => void;
  onClose: () => void;
}

export function SessionImporter({ projectId, onComplete, onClose }: SessionImporterProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'webm'].includes(ext || '');
    });
    setFiles(validFiles);
  };

  // 使用 XMLHttpRequest 上传单个文件，获取真实进度
  const uploadFileWithProgress = async (projectId: string, file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      const authHeaders = getAuthHeaders();

      // 监听上传进度
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const fileProgress = Math.round((event.loaded / event.total) * 100);
          // 计算总进度：当前文件的进度 + 已完成文件
          const totalProgress = Math.round(
            ((currentFileIndex * 100) + fileProgress) / files.length
          );
          setProgress(totalProgress);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          resolve(response.id);
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.detail || `Upload failed: ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during upload'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Upload timeout'));
      };

      // 设置超时时间（大文件可能需要更长）
      xhr.timeout = 600000; // 10 minutes

      xhr.open('POST', `${getApiBase()}/sessions/?project_id=${projectId}`);

      // 设置认证 header
      if (authHeaders.Authorization) {
        xhr.setRequestHeader('Authorization', authHeaders.Authorization);
      }

      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setProgress(0);
    setCurrentFileIndex(0);

    try {
      const uploadedIds: string[] = [];

      for (let i = 0; i < files.length; i++) {
        setCurrentFileIndex(i);
        setCurrentFileName(files[i].name);

        const sessionId = await uploadFileWithProgress(projectId, files[i]);
        uploadedIds.push(sessionId);

        // 更新进度到该文件完成
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }

      // 显示成功消息
      setProgress(100);
      setCurrentFileName('');

      // 等待一小段时间让用户看到完成状态
      await new Promise(resolve => setTimeout(resolve, 500));

      onComplete();
      onClose();
    } catch (err) {
      alert('上传失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setUploading(false);
      setCurrentFileIndex(0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'webm'].includes(ext || '');
    });
    setFiles(validFiles);
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
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`p-8 border-2 border-dashed rounded-xl
                     text-center cursor-pointer transition-colors
                     ${uploading
                       ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                       : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,.webm"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />
          <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center
                          ${uploading ? 'bg-gray-100' : 'bg-blue-100'}`}>
            <svg className={`w-6 h-6 ${uploading ? 'text-gray-400' : 'text-blue-500'}`}
                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className={`text-sm font-body ${uploading ? 'text-slate-400' : 'text-slate-600'}`}>
            {uploading ? '上传进行中...' : '点击选择或拖拽音频文件'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            支持 WAV, MP3, M4A, FLAC, OGG, WebM
          </p>
        </div>

        {/* Selected Files */}
        {files.length > 0 && !uploading && (
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
            {/* Current file info */}
            {currentFileName && (
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                <span className="text-sm text-slate-600 truncate">
                  正在上传: {currentFileName}
                </span>
              </div>
            )}

            {/* Progress bar */}
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>
                {files.length > 1
                  ? `文件 ${currentFileIndex + 1}/${files.length}`
                  : '上传中...'}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Processing hint */}
            <p className="text-xs text-slate-400 mt-2">
              上传完成后将自动开始转写和信息提取
            </p>
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
            {uploading
              ? (progress < 100 ? '上传中...' : '完成!')
              : `上传 ${files.length} 个文件`}
          </button>
        </div>
      </div>
    </div>
  );
}