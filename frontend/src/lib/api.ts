import type { TranscriptionResponse, TranscriptionTask, PolishResult, PolishStyle } from '../types';
import { getAuthHeaders } from './auth';

// Use relative URL for API - works with both localhost and LAN access
const API_BASE = '/api';

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    ...options.headers,
    ...getAuthHeaders(),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 如果返回 401，提示用户输入 token
  if (response.status === 401) {
    const error = await response.json();
    throw new Error(error.detail || '认证失败，请检查 Auth Token');
  }

  return response;
}

export async function uploadAudio(file: File): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetchWithAuth(`${API_BASE}/transcribe/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Upload failed');
  }

  return response.json();
}

export async function getTranscription(taskId: string): Promise<TranscriptionTask> {
  const response = await fetchWithAuth(`${API_BASE}/transcribe/${taskId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get transcription');
  }

  return response.json();
}

export async function listTranscriptions(limit = 50, offset = 0): Promise<{ tasks: TranscriptionTask[]; total: number }> {
  const response = await fetchWithAuth(`${API_BASE}/transcribe/?limit=${limit}&offset=${offset}`);

  if (!response.ok) {
    throw new Error('Failed to list transcriptions');
  }

  return response.json();
}

export async function deleteTranscription(taskId: string): Promise<void> {
  const response = await fetchWithAuth(`${API_BASE}/transcribe/${taskId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete');
  }
}

export async function polishText(
  text: string,
  style: PolishStyle = 'standard',
  includeSummary = false
): Promise<PolishResult> {
  const response = await fetchWithAuth(`${API_BASE}/polish/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, style, include_summary: includeSummary }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Polish failed');
  }

  return response.json();
}

export async function polishTask(
  taskId: string,
  style: PolishStyle = 'standard',
  includeSummary = false
): Promise<PolishResult> {
  const response = await fetchWithAuth(`${API_BASE}/polish/task/${taskId}?style=${style}&include_summary=${includeSummary}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Polish failed');
  }

  return response.json();
}

export function polishStream(
  text: string,
  style: PolishStyle = 'standard',
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): () => void {
  const controller = new AbortController();
  const authHeaders = getAuthHeaders();

  fetch(`${API_BASE}/polish/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ text, style }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (response.status === 401) {
        throw new Error('认证失败，请检查 Auth Token');
      }
      if (!response.ok) {
        throw new Error('Stream failed');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              onComplete();
              return;
            }
            onChunk(data);
          }
        }
      }

      onComplete();
    })
    .catch((error) => {
      if (error.name !== 'AbortError') {
        onError(error);
      }
    });

  return () => controller.abort();
}
