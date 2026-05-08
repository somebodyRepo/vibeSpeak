import { useCallback, useEffect, useRef, useState } from 'react';

interface UseMediaRecorderOptions {
  onStop?: (blob: Blob, duration: number) => void;
  onError?: (error: Error) => void;
  // 录音时实时回调，用于显示音量等
  onAudioLevel?: (level: number) => void;
}

interface UseMediaRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  formattedDuration: string;
  audioBlob: Blob | null;
  audioUrl: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
}

/**
 * 使用 MediaRecorder API 进行本地录音
 * 录制完成后生成 M4A/WebM 格式的音频文件
 */
export function useMediaRecorder(options: UseMediaRecorderOptions = {}): UseMediaRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  const optionsRef = useRef(options);

  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Audio level monitoring
  const startAudioLevelMonitoring = useCallback(() => {
    if (!analyserRef.current || !optionsRef.current.onAudioLevel) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      if (!analyserRef.current) return;

      analyser.getByteFrequencyData(dataArray);
      // Calculate average level
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const normalizedLevel = average / 255;
      optionsRef.current.onAudioLevel?.(normalizedLevel);

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }, []);

  const stopAudioLevelMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    console.log('[useMediaRecorder] startRecording called');

    // Check if mediaDevices is available (requires HTTPS or localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const error = new Error(
        '麦克风访问需要安全连接（HTTPS 或 localhost）。\n' +
        '请使用 http://localhost:5173 访问，而不是局域网 IP 地址。\n' +
        '当前地址: ' + window.location.href
      );
      console.error('[useMediaRecorder]', error.message);
      optionsRef.current.onError?.(error);
      return;
    }

    try {
      console.log('[useMediaRecorder] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      console.log('[useMediaRecorder] Microphone stream obtained');
      streamRef.current = stream;

      // Setup audio level monitoring
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;

      // Determine supported MIME type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];

      let mimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      if (!mimeType) {
        console.warn('[useMediaRecorder] No preferred MIME type supported, using default');
        mimeType = 'audio/webm';
      }

      console.log('[useMediaRecorder] Using MIME type:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });
      mediaRecorderRef.current = mediaRecorder;

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const recordedDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);

        console.log('[useMediaRecorder] Recording stopped, duration:', recordedDuration, 's');
        console.log('[useMediaRecorder] Blob size:', blob.size, 'bytes, type:', blob.type);

        // Create URL for the blob
        const url = URL.createObjectURL(blob);

        setAudioBlob(blob);
        setAudioUrl(url);
        setIsRecording(false);
        setDuration(0);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;

        // Stop audio level monitoring
        stopAudioLevelMonitoring();

        // Cleanup interval
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }

        // Call the onStop callback
        optionsRef.current.onStop?.(blob, recordedDuration);
      };

      mediaRecorder.onerror = (event) => {
        console.error('[useMediaRecorder] MediaRecorder error:', event);
        optionsRef.current.onError?.(new Error('Recording failed'));
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setIsPaused(false);

      // Update duration
      durationIntervalRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Start audio level monitoring
      startAudioLevelMonitoring();

      console.log('[useMediaRecorder] Recording started successfully');

    } catch (error) {
      console.error('[useMediaRecorder] Error:', error);
      optionsRef.current.onError?.(error as Error);
    }
  }, [startAudioLevelMonitoring, stopAudioLevelMonitoring]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopAudioLevelMonitoring();
  }, [stopAudioLevelMonitoring]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);

      // Pause duration counter
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      stopAudioLevelMonitoring();
    }
  }, [stopAudioLevelMonitoring]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);

      // Resume duration counter
      durationIntervalRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      startAudioLevelMonitoring();
    }
  }, [startAudioLevelMonitoring, stopAudioLevelMonitoring]);

  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    isRecording,
    isPaused,
    duration,
    formattedDuration: formatDuration(duration),
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
}
