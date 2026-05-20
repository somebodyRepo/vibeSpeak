import type { TranscriptionResponse, TranscriptionTask, PolishResult, PolishStyle, Project, ProjectCreate, ProjectUpdate, Outline, OutlineCreate, OutlineImport, InterviewSession, SessionUpdate } from '../types';
import { getAuthHeaders } from './auth';
import { getApiBase } from './config';

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

  const response = await fetchWithAuth(`${getApiBase()}/transcribe/upload`, {
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
  const response = await fetchWithAuth(`${getApiBase()}/transcribe/${taskId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get transcription');
  }

  return response.json();
}

export async function listTranscriptions(limit = 50, offset = 0): Promise<{ tasks: TranscriptionTask[]; total: number }> {
  const response = await fetchWithAuth(`${getApiBase()}/transcribe/?limit=${limit}&offset=${offset}`);

  if (!response.ok) {
    throw new Error('Failed to list transcriptions');
  }

  return response.json();
}

export async function deleteTranscription(taskId: string): Promise<void> {
  const response = await fetchWithAuth(`${getApiBase()}/transcribe/${taskId}`, {
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
  const response = await fetchWithAuth(`${getApiBase()}/polish/`, {
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
  const response = await fetchWithAuth(`${getApiBase()}/polish/task/${taskId}?style=${style}&include_summary=${includeSummary}`, {
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

  fetch(`${getApiBase()}/polish/stream`, {
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

// ===== 新增: 项目管理 API =====

// 项目
export async function createProject(data: ProjectCreate): Promise<Project> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create project');
  }
  return response.json();
}

export async function listProjects(limit = 50, offset = 0): Promise<{ projects: Project[]; total: number }> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/?limit=${limit}&offset=${offset}`);
  if (!response.ok) throw new Error('Failed to list projects');
  return response.json();
}

export async function getProject(projectId: string): Promise<Project> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get project');
  }
  return response.json();
}

export async function updateProject(projectId: string, data: ProjectUpdate): Promise<Project> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update project');
  }
  return response.json();
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}`, { method: 'DELETE' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete project');
  }
}

export async function exportProject(projectId: string): Promise<Blob> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}/export`);
  if (!response.ok) throw new Error('Failed to export project');
  return response.blob();
}

// 提纲
export async function createOutline(data: OutlineCreate): Promise<Outline> {
  const response = await fetchWithAuth(`${getApiBase()}/outlines/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create outline');
  }
  return response.json();
}

export async function importOutline(data: OutlineImport): Promise<Outline> {
  const response = await fetchWithAuth(`${getApiBase()}/outlines/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to import outline');
  }
  return response.json();
}

export async function listOutlines(limit = 50, offset = 0): Promise<{ outlines: Outline[]; total: number }> {
  const response = await fetchWithAuth(`${getApiBase()}/outlines/?limit=${limit}&offset=${offset}`);
  if (!response.ok) throw new Error('Failed to list outlines');
  return response.json();
}

export async function getOutline(outlineId: string): Promise<Outline> {
  const response = await fetchWithAuth(`${getApiBase()}/outlines/${outlineId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get outline');
  }
  return response.json();
}

export async function updateOutline(outlineId: string, data: Partial<OutlineCreate>): Promise<Outline> {
  const response = await fetchWithAuth(`${getApiBase()}/outlines/${outlineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update outline');
  }
  return response.json();
}

export async function deleteOutline(outlineId: string): Promise<void> {
  const response = await fetchWithAuth(`${getApiBase()}/outlines/${outlineId}`, { method: 'DELETE' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete outline');
  }
}

// 会话
export async function createSession(projectId: string, file: File): Promise<InterviewSession> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetchWithAuth(`${getApiBase()}/sessions/?project_id=${projectId}`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create session');
  }
  return response.json();
}

export async function batchImportSessions(projectId: string, files: File[]): Promise<{ session_ids: string[] }> {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  const response = await fetchWithAuth(`${getApiBase()}/sessions/batch-import?project_id=${projectId}`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to batch import');
  }
  return response.json();
}

export async function listSessions(projectId: string, limit = 50, offset = 0): Promise<{ sessions: InterviewSession[]; total: number }> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/?project_id=${projectId}&limit=${limit}&offset=${offset}`);
  if (!response.ok) throw new Error('Failed to list sessions');
  return response.json();
}

export async function getSession(sessionId: string): Promise<InterviewSession> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get session');
  }
  return response.json();
}

export async function updateSession(sessionId: string, data: SessionUpdate): Promise<InterviewSession> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update session');
  }
  return response.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}`, { method: 'DELETE' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete session');
  }
}

// 处理流程
export async function transcribeSession(sessionId: string): Promise<{ success: boolean; message: string }> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/transcribe`, { method: 'POST' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to start transcription');
  }
  return response.json();
}

export async function extractSessionInfo(sessionId: string): Promise<{ success: boolean; extracted_info: Record<string, unknown> }> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/extract`, { method: 'POST' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to extract info');
  }
  return response.json();
}

export async function validateSession(sessionId: string): Promise<{ success: boolean; missing_info: string }> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/validate`, { method: 'POST' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to validate');
  }
  return response.json();
}

export async function finalizeSession(sessionId: string): Promise<{ success: boolean; final_content: string }> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/finalize`, { method: 'POST' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to finalize');
  }
  return response.json();
}

// 导出
export async function exportSessionAudio(sessionId: string): Promise<Blob> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/export/audio`);
  if (!response.ok) throw new Error('Failed to export audio');
  return response.blob();
}

export async function exportSessionTranscript(sessionId: string): Promise<Blob> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/export/transcript`);
  if (!response.ok) throw new Error('Failed to export transcript');
  return response.blob();
}

export async function exportSessionExtracted(sessionId: string): Promise<Blob> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/export/extracted`);
  if (!response.ok) throw new Error('Failed to export extracted');
  return response.blob();
}

export async function exportSessionFinal(sessionId: string): Promise<Blob> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/export/final`);
  if (!response.ok) throw new Error('Failed to export final');
  return response.blob();
}

// ===== 单访谈表格生成 API =====

export async function generateSessionTable(sessionId: string): Promise<{ success: boolean; table_content: string }> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/generate-table`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to generate session table');
  }
  return response.json();
}

export async function getSessionTable(sessionId: string): Promise<{ success: boolean; table_content: string; status: string }> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/table`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get session table');
  }
  return response.json();
}

export async function updateSessionTable(sessionId: string, tableContent: string): Promise<{ success: boolean; table_content: string }> {
  const response = await fetchWithAuth(`${getApiBase()}/sessions/${sessionId}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table_content: tableContent }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update session table');
  }
  return response.json();
}

// ===== 批量表格生成 API =====

export async function generateAllTables(projectId: string): Promise<{ success: boolean; total_count: number; pending_count: number }> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}/generate-all-tables`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to start batch generation');
  }
  return response.json();
}

export async function getTableGenerationProgress(projectId: string): Promise<{
  success: boolean;
  is_running: boolean;
  total_count: number;
  completed_count: number;
  error_count: number;
  tasks: Array<{ session_id: string; status: string; error_message: string; retry_count: number }>;
}> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}/table-generation-progress`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get progress');
  }
  return response.json();
}

// ===== 表格整合汇总 API =====

export async function summarizeTables(projectId: string): Promise<{ success: boolean; summary_table: string; session_count: number }> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}/summarize-tables`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to summarize tables');
  }
  return response.json();
}

export async function getSummaryTable(projectId: string): Promise<{ success: boolean; summary_table: string }> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}/summary-table`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get summary table');
  }
  return response.json();
}

export async function exportSummaryTable(projectId: string): Promise<Blob> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}/export-summary`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to export summary table');
  }
  return response.blob();
}

// ===== 提示词模板 API =====

export async function generateStructurePrompt(projectId: string): Promise<{ success: boolean; table_structure_prompt: string }> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}/generate-structure-prompt`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to generate structure prompt');
  }
  return response.json();
}

export async function getStructurePrompt(projectId: string): Promise<{ success: boolean; table_structure_prompt: string }> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}/structure-prompt`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get structure prompt');
  }
  return response.json();
}

export async function updateStructurePrompt(projectId: string, prompt: string): Promise<{ success: boolean; table_structure_prompt: string }> {
  const response = await fetchWithAuth(`${getApiBase()}/projects/${projectId}/structure-prompt`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table_structure_prompt: prompt }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update structure prompt');
  }
  return response.json();
}
