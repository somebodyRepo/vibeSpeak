export interface TranscriptionSegment {
  text: string;
  start_ms: number;
  end_ms: number;
  speaker?: string;
}

export interface TranscriptionTask {
  id: string;
  filename: string;
  duration_s?: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  segments: TranscriptionSegment[];
  raw_text: string;
  polished?: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptionResponse {
  task_id: string;
  status: string;
  filename: string;
}

export interface RealtimeSegment {
  text: string;
  is_final: boolean;
  speaker?: string;
}

export interface PolishResult {
  original: string;
  polished: string;
  summary?: string;
}

export type LLMProvider = 'anthropic' | 'openai' | 'deepseek' | 'zhipu';
export type PolishStyle = 'standard' | 'formal' | 'concise' | 'summary';
