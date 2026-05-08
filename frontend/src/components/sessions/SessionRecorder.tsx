import { useState } from 'react';
import { useMediaRecorder } from '../../hooks/useMediaRecorder';
import { getAuthHeaders } from '../../lib/auth';
import { getApiBase } from '../../lib/config';
import type { Project, OutlineSection } from '../../types';

interface SessionRecorderProps {
  project: Project;
  onComplete: (sessionId: string) => void;
  onCancel: () => void;
}

export function SessionRecorder({ project, onComplete, onCancel }: SessionRecorderProps) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());
  const [audioLevel, setAudioLevel] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const outline = project.outline;

  // 录音完成后的处理
  const handleRecordingStop = async (blob: Blob, duration: number) => {
    if (duration < 1) {
      alert('录音时间太短，请至少录制 1 秒');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // 创建文件名
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      const ext = blob.type.includes('webm') ? 'webm' : 'm4a';
      const filename = `${project.name}_${timestamp}.${ext}`;

      // 创建 File 对象
      const file = new File([blob], filename, { type: blob.type });

      // 使用 XMLHttpRequest 上传以获取进度
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();

      // 获取认证 token
      const authHeaders = getAuthHeaders();

      await new Promise((resolve, reject) => {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progress);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Upload failed'));

        xhr.open('POST', `${getApiBase()}/sessions/?project_id=${project.id}`);
        if (authHeaders.Authorization) {
          xhr.setRequestHeader('Authorization', authHeaders.Authorization);
        }
        xhr.send(formData);
      });

      // 解析响应获取 session ID
      const response = JSON.parse(xhr.responseText);
      onComplete(response.id);

    } catch (error) {
      console.error('Upload error:', error);
      alert('上传失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setUploading(false);
    }
  };

  // 使用 MediaRecorder hook
  const {
    isRecording,
    isPaused,
    formattedDuration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  } = useMediaRecorder({
    onStop: handleRecordingStop,
    onError: (error) => {
      alert('录音错误: ' + error.message);
    },
    onAudioLevel: (level) => {
      setAudioLevel(level);
    },
  });

  // 标记板块完成
  const markSectionComplete = (sectionId: string) => {
    setCompletedSections((prev) => new Set([...prev, sectionId]));
    // 移动到下一个板块
    if (outline && currentSectionIndex < outline.content.sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1);
    }
  };

  // 获取当前板块
  const currentSection: OutlineSection | null = outline?.content.sections[currentSectionIndex] || null;

  if (!outline) {
    return (
      <div className="p-6 rounded-2xl bg-gray-100 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-800 mb-2">项目未关联提纲</h3>
        <p className="text-sm text-slate-500 mb-4">请先为项目关联调研提纲，以便引导录音</p>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white
                     bg-gradient-to-r from-blue-500 to-blue-600 cursor-pointer"
        >
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            disabled={isRecording || uploading}
            className="p-2 rounded-lg text-slate-500 hover:bg-gray-100
                       disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-heading font-semibold text-slate-800">
              新建访谈录音
            </h2>
            <p className="text-sm text-slate-500">{project.name}</p>
          </div>
        </div>
      </div>

      {/* Outline Progress */}
      <div className="p-4 rounded-2xl bg-gray-50
                      shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04)]">
        <h3 className="font-medium text-slate-700 mb-3 font-heading">提纲进度</h3>
        <div className="space-y-2">
          {outline.content.sections.map((section, idx) => (
            <div
              key={section.id}
              className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                idx === currentSectionIndex
                  ? 'bg-blue-100 text-blue-700'
                  : completedSections.has(section.id)
                  ? 'text-green-600'
                  : 'text-slate-400'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs
                             bg-white shadow-sm">
                {completedSections.has(section.id) ? (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : idx === currentSectionIndex ? (
                  '→'
                ) : (
                  idx + 1
                )}
              </span>
              <span className="text-sm font-medium">{section.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Current Section Prompt */}
      {currentSection && (
        <div className="p-4 rounded-2xl bg-blue-50
                        shadow-[inset_2px_2px_6px_rgba(59,130,246,0.1)]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-blue-800 font-heading">
              当前板块: {currentSection.title}
            </h4>
            <button
              onClick={() => markSectionComplete(currentSection.id)}
              disabled={!isRecording || isPaused}
              className="px-3 py-1 rounded-lg text-xs font-medium
                         bg-green-100 text-green-600 hover:bg-green-200
                         disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              完成 →
            </button>
          </div>
          <ul className="space-y-1">
            {currentSection.questions.map((q, i) => (
              <li key={i} className="text-sm text-blue-600 flex items-start gap-2">
                <span className="mt-0.5">{i + 1}.</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recording Controls */}
      <div className="flex flex-col items-center py-8">
        {/* Timer */}
        <div className="mb-6 text-center">
          <span className="text-4xl font-mono text-slate-700">{formattedDuration}</span>
        </div>

        {/* Audio Level Indicator */}
        {isRecording && (
          <div className="mb-4 w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-100"
              style={{ width: `${Math.min(audioLevel * 100 * 3, 100)}%` }}
            />
          </div>
        )}

        {/* Main Recording Button */}
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={uploading}
            className="w-24 h-24 rounded-full flex items-center justify-center
                       bg-gradient-to-br from-orange-400 to-orange-500
                       shadow-[8px_8px_20px_rgba(251,146,60,0.4),-8px_-8px_20px_rgba(255,255,255,0.8)]
                       hover:shadow-[10px_10px_25px_rgba(251,146,60,0.5)]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer"
          >
            {uploading ? (
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
                <span className="text-xs text-white mt-1">{uploadProgress}%</span>
              </div>
            ) : (
              <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-4">
            {/* Pause/Resume */}
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="w-16 h-16 rounded-full flex items-center justify-center
                         bg-gray-200 text-slate-600
                         shadow-[4px_4px_10px_rgba(0,0,0,0.1),-4px_-4px_10px_rgba(255,255,255,0.8)]
                         hover:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.1)]
                         transition-all duration-200 cursor-pointer"
            >
              {isPaused ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>

            {/* Stop */}
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full flex items-center justify-center
                         bg-gradient-to-br from-red-400 to-red-500
                         shadow-[6px_6px_15px_rgba(239,68,68,0.4)]
                         hover:shadow-[8px_8px_20px_rgba(239,68,68,0.5)]
                         transition-all duration-200 cursor-pointer"
            >
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h12v12H6z" />
              </svg>
            </button>

            {/* Next Section */}
            <button
              onClick={() => currentSection && markSectionComplete(currentSection.id)}
              disabled={currentSectionIndex >= outline.content.sections.length - 1}
              className="w-16 h-16 rounded-full flex items-center justify-center
                         bg-green-100 text-green-600
                         shadow-[4px_4px_10px_rgba(34,197,94,0.2),-4px_-4px_10px_rgba(255,255,255,0.8)]
                         hover:shadow-[inset_3px_3px_8px_rgba(34,197,94,0.2)]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 cursor-pointer"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Status */}
        <div className="mt-4 text-center">
          {uploading ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">上传中... {uploadProgress}%</span>
            </div>
          ) : isRecording ? (
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isPaused ? 'bg-yellow-400' : 'bg-red-500 animate-pulse'}`} />
              <span className="text-sm text-slate-600">
                {isPaused ? '已暂停' : '录音中...'}
              </span>
            </div>
          ) : (
            <span className="text-sm text-slate-400">点击开始录音</span>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="p-4 rounded-2xl bg-gray-50
                      shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04)]">
        <h3 className="font-medium text-slate-700 mb-2 font-heading">录音说明</h3>
        <ul className="text-sm text-slate-600 space-y-1">
          <li>• 录音完成后将自动上传并开始转写</li>
          <li>• 转写完成后会根据提纲自动提取信息</li>
          <li>• 音频文件保存在项目中，可随时导出</li>
        </ul>
      </div>
    </div>
  );
}
