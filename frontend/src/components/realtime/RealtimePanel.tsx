import { useCallback, useRef, useState } from 'react';
import { useAudioCapture } from '../../hooks/useAudioCapture';
import { useWebSocket } from '../../hooks/useWebSocket';
import { MicControl } from './MicControl';
import { TranscriptStream } from './TranscriptStream';
import { PolishPanel } from '../polish/PolishPanel';
import { getAuthToken } from '../../lib/auth';

interface TranscriptItem {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: Date;
}

export function RealtimePanel() {
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [showPolish, setShowPolish] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const audioBufferRef = useRef<Int16Array[]>([]);
  const isReadyRef = useRef(false);
  const sendRef = useRef<((data: unknown) => boolean) | null>(null);

  const handleTranscriptUpdate = useCallback((text: string, isFinal: boolean) => {
    setTranscripts((prev) => {
      if (prev.length === 0) {
        return [{ id: Date.now().toString(), text, isFinal, timestamp: new Date() }];
      }

      const last = prev[prev.length - 1];
      if (!last.isFinal && !isFinal) {
        // Update ongoing transcript
        return [...prev.slice(0, -1), { ...last, text }];
      } else if (!last.isFinal && isFinal) {
        // Finalize current transcript
        return [...prev.slice(0, -1), { ...last, text, isFinal: true }];
      } else {
        // Add new transcript
        return [...prev, { id: Date.now().toString(), text, isFinal, timestamp: new Date() }];
      }
    });
  }, []);

  // Build WebSocket URL dynamically to support both localhost and LAN access
  // Include auth token if available
  const buildWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const token = getAuthToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${protocol}//${host}/ws/realtime${tokenParam}`;
  };

  const wsUrl = buildWsUrl();

  const { isConnected, connect, disconnect, send } = useWebSocket(
    wsUrl,
    {
      onConnect: () => {
        console.log('[RealtimePanel] onConnect callback');
        // Store send function in ref for audio callback to use
        sendRef.current = send;
        // Send init message immediately after connection
        console.log('[RealtimePanel] Sending init message');
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
          // Backend is ready, start sending audio
          console.log('[RealtimePanel] Backend ready, starting audio stream');
          setIsReady(true);
          isReadyRef.current = true;
          setIsConnecting(false);

          // Send any buffered audio data
          console.log('[RealtimePanel] Sending buffered audio chunks:', audioBufferRef.current.length);
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
          handleTranscriptUpdate(data.text as string, data.is_final as boolean);
        } else if (data.type === 'error') {
          alert('转写错误: ' + (data.message || '未知错误'));
        }
      },
    }
  );

  // Use refs in audio callback to avoid stale closure issue
  const { isRecording, formattedDuration, startRecording, stopRecording } = useAudioCapture({
    onAudioData: (data) => {
      console.log('[RealtimePanel] onAudioData, isReadyRef:', isReadyRef.current, 'sendRef:', sendRef.current ? 'exists' : 'null');
      if (isReadyRef.current && sendRef.current) {
        // Backend is ready, send audio directly
        const bytes = new Uint8Array(data.buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        console.log('[RealtimePanel] Sending audio chunk, size:', base64.length);
        sendRef.current({ type: 'audio', data: base64 });
      } else if (sendRef.current) {
        // Buffer audio until backend is ready
        console.log('[RealtimePanel] Buffering audio chunk');
        audioBufferRef.current.push(data);
      } else {
        console.log('[RealtimePanel] No send function available, skipping audio');
      }
    },
  });

  const handleToggleRecording = async () => {
    console.log('[RealtimePanel] handleToggleRecording, isRecording:', isRecording);

    // Check if mediaDevices is available before starting
    if (!isRecording && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
      alert(
        '麦克风访问需要安全连接。\n\n' +
        '请使用以下地址访问：\n' +
        'http://localhost:5173\n\n' +
        '当前使用的局域网地址 (http://' + window.location.host + ') 不支持麦克风访问。\n' +
        '浏览器安全策略要求 HTTPS 或 localhost 才能使用麦克风。'
      );
      return;
    }

    if (isRecording) {
      // Stop recording
      console.log('[RealtimePanel] Stopping recording');
      stopRecording();
      send({ type: 'stop' });
      disconnect();
      setIsReady(false);
      isReadyRef.current = false;
      sendRef.current = null;
    } else {
      // Start recording
      console.log('[RealtimePanel] Starting recording');
      setTranscripts([]);
      setIsConnecting(true);
      audioBufferRef.current = [];
      isReadyRef.current = false;
      sendRef.current = null;

      try {
        // First connect WebSocket
        console.log('[RealtimePanel] Calling connect()');
        connect();
        // Then request microphone permission
        console.log('[RealtimePanel] Requesting microphone permission');
        await startRecording();
        console.log('[RealtimePanel] Microphone permission granted');
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

  const fullText = transcripts
    .filter((t) => t.isFinal)
    .map((t) => t.text)
    .join('\n');

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
          <TranscriptStream transcripts={transcripts} />

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <MicControl
              isRecording={isRecording}
              isConnecting={isConnecting || (isConnected && !isReady)}
              onToggle={handleToggleRecording}
            />
          </div>

          {transcripts.length > 0 && (
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setShowPolish(!showPolish)}
                disabled={!fullText}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  } catch (err) {
                    alert('复制失败');
                  }
                }}
                disabled={!fullText}
                className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
