import { useRef, useState } from 'react';
import { useAudioCapture } from '../../hooks/useAudioCapture';
import { useWebSocket } from '../../hooks/useWebSocket';
import { MicControl } from './MicControl';
import { TranscriptStream } from './TranscriptStream';
import { PolishPanel } from '../polish/PolishPanel';
import { getAuthToken } from '../../lib/auth';
import { getWebSocketUrl } from '../../lib/config';

interface TranscriptState {
  // 已确认的文本（累积的完整内容）
  confirmedText: string;
  // 当前正在识别的片段（实时更新）
  currentSegment: string;
  // 最终完整的文本
  finalText: string;
}

export function RealtimePanel() {
  const [transcriptState, setTranscriptState] = useState<TranscriptState>({
    confirmedText: '',
    currentSegment: '',
    finalText: '',
  });
  const [showPolish, setShowPolish] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const audioBufferRef = useRef<Int16Array[]>([]);
  const isReadyRef = useRef(false);
  const sendRef = useRef<((data: unknown) => boolean) | null>(null);

  // WebSocket URL
  const buildWsUrl = () => {
    const token = getAuthToken();
    return getWebSocketUrl('/ws/realtime', token);
  };

  const wsUrl = buildWsUrl();

  const { isConnected, connect, disconnect, send } = useWebSocket(
    wsUrl,
    {
      onConnect: () => {
        console.log('[RealtimePanel] onConnect callback');
        sendRef.current = send;
        send({ type: 'init', sample_rate: 16000 });
      },
      onDisconnect: () => {
        console.log('[RealtimePanel] onDisconnect callback');
        setIsConnecting(false);
        setIsReady(false);
        isReadyRef.current = false;
        sendRef.current = null;
      },
      onError: (error) => {
        console.error('[RealtimePanel] WebSocket error:', error);
        setIsConnecting(false);
        setIsReady(false);
        isReadyRef.current = false;
        sendRef.current = null;
        alert('WebSocket 连接失败，请检查后端服务是否启动');
      },
      onMessage: (data) => {
        console.log('[RealtimePanel] Message received:', data);
        if (data.type === 'ready') {
          console.log('[RealtimePanel] Backend ready, starting audio stream');
          setIsReady(true);
          isReadyRef.current = true;
          setIsConnecting(false);

          // Send buffered audio data
          audioBufferRef.current.forEach((audioData) => {
            const bytes = new Uint8Array(audioData.buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            sendRef.current?.({ type: 'audio', data: base64 });
          });
          audioBufferRef.current = [];
        } else if (data.type === 'result') {
          // 更新转录状态
          const text = data.text as string;
          const isFinal = data.is_final as boolean;
          const currentSegment = data.current_segment as string || '';

          if (isFinal) {
            // 最终结果
            setTranscriptState({
              confirmedText: '',
              currentSegment: '',
              finalText: text,
            });
          } else {
            // 实时更新：显示累积文本 + 当前片段
            setTranscriptState(prev => ({
              confirmedText: prev.finalText,
              currentSegment: currentSegment,
              finalText: text,
            }));
          }
        } else if (data.type === 'error') {
          alert('转写错误: ' + (data.message || '未知错误'));
        }
      },
    }
  );

  // Audio capture
  const { isRecording, formattedDuration, startRecording, stopRecording } = useAudioCapture({
    onAudioData: (data) => {
      if (isReadyRef.current && sendRef.current) {
        const bytes = new Uint8Array(data.buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        sendRef.current({ type: 'audio', data: base64 });
      } else if (sendRef.current) {
        audioBufferRef.current.push(data);
      }
    },
  });

  const handleToggleRecording = async () => {
    if (!isRecording && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
      alert(
        '麦克风访问需要安全连接。\n\n' +
        '请使用以下地址访问：\n' +
        'http://localhost:5173\n\n' +
        '当前使用的局域网地址不支持麦克风访问。'
      );
      return;
    }

    if (isRecording) {
      // Stop recording
      stopRecording();
      send({ type: 'stop' });
      disconnect();
      setIsReady(false);
      isReadyRef.current = false;
      sendRef.current = null;
    } else {
      // Start recording
      setTranscriptState({
        confirmedText: '',
        currentSegment: '',
        finalText: '',
      });
      setIsConnecting(true);
      audioBufferRef.current = [];
      isReadyRef.current = false;
      sendRef.current = null;

      try {
        connect();
        await startRecording();
      } catch (err) {
        console.error('[RealtimePanel] Failed to start recording:', err);
        setIsConnecting(false);
        isReadyRef.current = false;
        disconnect();
        const errorMsg = err instanceof Error ? err.message : '无法访问麦克风，请检查浏览器权限设置';
        alert(errorMsg);
      }
    }
  };

  // 完整文本用于复制和润色
  const fullText = transcriptState.finalText;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">实时语音转写</h1>
          <p className="mt-1 text-sm text-gray-400">边说话边转文字，支持普通话和四川方言</p>
        </div>
        {isRecording && (
          <div className="flex items-center gap-2 text-red-400">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="font-mono text-lg">{formattedDuration}</span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Transcript Area */}
        <div className="lg:col-span-2 space-y-4">
          <TranscriptStream
            confirmedText={transcriptState.confirmedText}
            currentSegment={transcriptState.currentSegment}
            finalText={transcriptState.finalText}
          />

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <MicControl
              isRecording={isRecording}
              isConnecting={isConnecting || (isConnected && !isReady)}
              onToggle={handleToggleRecording}
            />
          </div>

          {fullText && (
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setShowPolish(!showPolish)}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {showPolish ? '隐藏润色' : 'AI 润色'}
              </button>

              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(fullText);
                    alert('已复制到剪贴板');
                  } catch {
                    alert('复制失败');
                  }
                }}
                className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                复制全文
              </button>
            </div>
          )}
        </div>

        {/* Polish Panel */}
        {showPolish && fullText && (
          <div className="lg:col-span-1">
            <PolishPanel originalText={fullText} />
          </div>
        )}
      </div>
    </div>
  );
}
