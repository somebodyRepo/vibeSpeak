import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAudioCaptureOptions {
  onAudioData?: (data: Int16Array) => void;
  onError?: (error: Error) => void;
}

export function useAudioCapture(options: UseAudioCaptureOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<number | null>(null);
  const optionsRef = useRef(options);

  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const startRecording = useCallback(async () => {
    console.log('[useAudioCapture] startRecording called');

    // Check if mediaDevices is available (requires HTTPS or localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const error = new Error(
        '麦克风访问需要安全连接（HTTPS 或 localhost）。\n' +
        '请使用 http://localhost:5173 访问，而不是局域网 IP 地址。\n' +
        '当前地址: ' + window.location.href
      );
      console.error('[useAudioCapture]', error.message);
      optionsRef.current.onError?.(error);
      return;
    }

    try {
      console.log('[useAudioCapture] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      console.log('[useAudioCapture] Microphone stream obtained');

      mediaStreamRef.current = stream;

      console.log('[useAudioCapture] Creating AudioContext...');
      const audioContext = new AudioContext({
        sampleRate: 16000,
      });
      audioContextRef.current = audioContext;
      console.log('[useAudioCapture] AudioContext created, state:', audioContext.state);

      // Resume AudioContext if suspended (required in some browsers)
      if (audioContext.state === 'suspended') {
        console.log('[useAudioCapture] AudioContext suspended, resuming...');
        await audioContext.resume();
        console.log('[useAudioCapture] AudioContext after resume:', audioContext.state);
      }

      console.log('[useAudioCapture] Creating source and processor...');
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        console.log('[useAudioCapture] onaudioprocess triggered');
        const inputData = event.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // Use ref to get latest callback
        if (optionsRef.current.onAudioData) {
          optionsRef.current.onAudioData(int16Data);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      console.log('[useAudioCapture] AudioContext state:', audioContext.state);
      console.log('[useAudioCapture] Processor connected, waiting for audio events...');

      startTimeRef.current = Date.now();
      setIsRecording(true);

      // Update duration
      durationIntervalRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      console.log('[useAudioCapture] Recording started successfully');

    } catch (error) {
      console.error('[useAudioCapture] Error:', error);
      optionsRef.current.onError?.(error as Error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    setDuration(0);
  }, []);

  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    isRecording,
    duration,
    formattedDuration: formatDuration(duration),
    startRecording,
    stopRecording,
  };
}
