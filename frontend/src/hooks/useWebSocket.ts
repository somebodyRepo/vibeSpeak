import { useCallback, useEffect, useRef, useState } from 'react';

interface WSMessage {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  onMessage?: (data: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  connectionTimeout?: number;
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const optionsRef = useRef(options);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const connect = useCallback(() => {
    console.log('[WS] connect() called, current state:', wsRef.current?.readyState);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected, skipping');
      return;
    }

    setIsConnecting(true);
    console.log('[WS] Connecting to:', url);

    // Set connection timeout (default 10 seconds)
    const timeout = options.connectionTimeout || 10000;
    timeoutRef.current = window.setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        console.error('[WS] Connection timeout');
        wsRef.current?.close();
        setIsConnecting(false);
        optionsRef.current.onError?.(new Event('timeout'));
      }
    }, timeout);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected! State:', ws.readyState);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsConnected(true);
        setIsConnecting(false);
        console.log('[WS] Calling onConnect callback');
        optionsRef.current.onConnect?.();
      };

      ws.onclose = (event) => {
        console.log('[WS] Disconnected, code:', event.code, 'reason:', event.reason);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;
        optionsRef.current.onDisconnect?.();
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsConnecting(false);
        optionsRef.current.onError?.(error);
      };

      ws.onmessage = (event) => {
        console.log('[WS] Message received:', event.data);
        try {
          const data = JSON.parse(event.data) as WSMessage;
          optionsRef.current.onMessage?.(data);
        } catch {
          console.error('[WS] Failed to parse message');
        }
      };
    } catch (error) {
      console.error('[WS] Failed to create WebSocket:', error);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsConnecting(false);
    }
  }, [url, options.connectionTimeout]);

  const disconnect = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const send = useCallback((data: unknown) => {
    const state = wsRef.current?.readyState;
    console.log('[WS] send() called, readyState:', state, '(OPEN=1)');
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const json = JSON.stringify(data);
      console.log('[WS] Sending:', json.substring(0, 100) + (json.length > 100 ? '...' : ''));
      wsRef.current.send(json);
      return true;
    }
    console.warn('[WS] Cannot send - WebSocket not open');
    return false;
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    send,
  };
}
