import { create } from 'zustand';
import type { Project, Outline, InterviewSession } from '../types';

interface ProjectState {
  // 项目列表
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (project: Project) => void;
  removeProject: (projectId: string) => void;

  // 当前选中项目
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;

  // 提纲列表
  outlines: Outline[];
  setOutlines: (outlines: Outline[]) => void;
  addOutline: (outline: Outline) => void;
  updateOutline: (outline: Outline) => void;
  removeOutline: (outlineId: string) => void;

  // 当前选中会话
  selectedSession: InterviewSession | null;
  setSelectedSession: (session: InterviewSession | null) => void;

  // 会话列表（当前项目的）
  sessions: InterviewSession[];
  setSessions: (sessions: InterviewSession[]) => void;
  addSession: (session: InterviewSession) => void;
  updateSession: (session: InterviewSession) => void;
  removeSession: (sessionId: string) => void;

  // UI 状态
  view: 'project-list' | 'project-detail' | 'session-detail' | 'recording';
  setView: (view: 'project-list' | 'project-detail' | 'session-detail' | 'recording') => void;

  // 加载状态
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // 错误信息
  error: string | null;
  setError: (error: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  // 项目列表
  projects: [],
  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
  updateProject: (project) => set((state) => ({
    projects: state.projects.map((p) => (p.id === project.id ? project : p)),
  })),
  removeProject: (projectId) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== projectId),
    selectedProject: state.selectedProject?.id === projectId ? null : state.selectedProject,
  })),

  // 当前选中项目
  selectedProject: null,
  setSelectedProject: (project) => set({ selectedProject: project }),

  // 提纲列表
  outlines: [],
  setOutlines: (outlines) => set({ outlines }),
  addOutline: (outline) => set((state) => ({ outlines: [...state.outlines, outline] })),
  updateOutline: (outline) => set((state) => ({
    outlines: state.outlines.map((o) => (o.id === outline.id ? outline : o)),
  })),
  removeOutline: (outlineId) => set((state) => ({
    outlines: state.outlines.filter((o) => o.id !== outlineId),
  })),

  // 当前选中会话
  selectedSession: null,
  setSelectedSession: (session) => set({ selectedSession: session }),

  // 会话列表
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((state) => ({ sessions: [...state.sessions, session] })),
  updateSession: (session) => set((state) => ({
    sessions: state.sessions.map((s) => (s.id === session.id ? session : s)),
  })),
  removeSession: (sessionId) => set((state) => ({
    sessions: state.sessions.filter((s) => s.id !== sessionId),
    selectedSession: state.selectedSession?.id === sessionId ? null : state.selectedSession,
  })),

  // UI 状态
  view: 'project-list',
  setView: (view) => set({ view }),

  // 加载状态
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  // 错误信息
  error: null,
  setError: (error) => set({ error }),
}));