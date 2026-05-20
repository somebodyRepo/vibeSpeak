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

// ===== 新增: 调研项目管理类型 =====

export interface OutlineSection {
  id: string;
  title: string;
  questions: string[];
}

export interface OutlineContent {
  sections: OutlineSection[];
}

export interface Outline {
  id: string;
  name: string;
  content: OutlineContent;
  created_at: string;
  updated_at: string;
}

export interface OutlineCreate {
  name: string;
  content?: OutlineContent;
}

export interface OutlineImport {
  name: string;
  format: 'json' | 'markdown';
  content: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  outline_id?: string;
  outline?: Outline;
  table_structure_prompt: string;
  summary_table: string;
  session_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  outline_id?: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  outline_id?: string;
  table_structure_prompt?: string;
}

export interface InterviewSession {
  id: string;
  project_id: string;
  filename: string;
  audio_path: string;
  duration_s: number;
  status: 'pending' | 'transcribing' | 'extracting' | 'validating' | 'tabled' | 'done' | 'error';
  raw_transcript: string;
  extracted_info: string;  // Markdown 格式
  supplementary_info: string;  // Markdown 格式
  final_content: string;  // Markdown 格式
  table_content: string;  // JSON 格式单访谈表格数据
  created_at: string;
  updated_at: string;
}

export interface SessionUpdate {
  filename?: string;
  supplementary_info?: string;
  final_content?: string;
}

