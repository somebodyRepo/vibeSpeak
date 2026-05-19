import { useState, useEffect } from 'react';
import { SessionList } from '../sessions/SessionList';
import { TableSummaryTab } from './TableSummaryTab';
import { getProject } from '../../lib/api';
import type { Project, InterviewSession } from '../../types';

type ActiveTab = 'info' | 'sessions' | 'summary';

interface ProjectDetailTabsProps {
  project: Project;
  onSelectSession: (session: InterviewSession) => void;
  onImportAudio: () => void;
  onStartRecording: () => void;
  onSessionsLoad: (sessions: InterviewSession[]) => void;
  onEditProject: () => void;
  onOpenExport: () => void;
  onBack: () => void;
  refreshKey: number;
  onProjectUpdate: (project: Project) => void;
}

export function ProjectDetailTabs({
  project,
  onSelectSession,
  onImportAudio,
  onStartRecording,
  onSessionsLoad,
  onEditProject,
  onOpenExport,
  onBack,
  refreshKey,
  onProjectUpdate,
}: ProjectDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('sessions');
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);

  const tabs = [
    { id: 'info', label: '基本信息' },
    { id: 'sessions', label: '访谈会话' },
    { id: 'summary', label: '表格汇总' },
  ];

  // Check if there are completed sessions
  const hasCompletedSessions = sessions.some(s => s.status === 'done');

  // Handle sessions load to track completed sessions
  const handleSessionsLoad = (loadedSessions: InterviewSession[]) => {
    setSessions(loadedSessions);
    onSessionsLoad(loadedSessions);
  };

  // Refresh project data when prompt is saved
  const handleProjectRefresh = async () => {
    try {
      const updatedProject = await getProject(project.id);
      onProjectUpdate(updatedProject);
    } catch (err) {
      console.error('Failed to refresh project:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-slate-500 hover:bg-gray-100 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-heading font-semibold text-slate-800">
              {project.name}
            </h1>
            <p className="text-sm text-slate-500">
              {project.description || '暂无描述'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onOpenExport}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600
                       bg-gray-100 hover:bg-gray-200 cursor-pointer"
          >
            批量导出
          </button>
          <button
            onClick={onEditProject}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600
                       bg-gray-100 hover:bg-gray-200 cursor-pointer"
          >
            编辑项目
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 p-1 rounded-xl bg-gray-100
                      shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04)]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as ActiveTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
                       ${activeTab === tab.id
                         ? 'bg-white text-slate-800 shadow-[3px_3px_8px_rgba(0,0,0,0.08),-3px_-3px_8px_rgba(255,255,255,0.8)]'
                         : 'text-slate-500 hover:text-slate-700'
                       }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="p-6 rounded-2xl bg-gray-100
                        shadow-[inset_5px_5px_15px_rgba(0,0,0,0.05),inset_-5px_-5px_15px_rgba(255,255,255,0.8)]">
          <h3 className="font-medium text-slate-700 mb-2 font-heading">
            项目信息
          </h3>
          <div className="space-y-3 text-sm text-slate-600">
            <div>
              <span className="font-medium">名称：</span>
              {project.name}
            </div>
            <div>
              <span className="font-medium">描述：</span>
              {project.description || '暂无'}
            </div>
            <div>
              <span className="font-medium">会话数：</span>
              {project.session_count}
            </div>
            <div>
              <span className="font-medium">创建时间：</span>
              {new Date(project.created_at).toLocaleString()}
            </div>
          </div>

          {/* Outline Preview */}
          {project.outline && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="font-medium text-slate-700 mb-2 font-heading">
                关联提纲: {project.outline.name}
              </h3>
              <div className="text-sm text-slate-600 space-y-2">
                {project.outline.content.sections.map(section => (
                  <div key={section.id}>
                    <span className="font-medium">{section.title}</span>
                    <ul className="ml-4 text-slate-500">
                      {section.questions.map((q, i) => (
                        <li key={i}>• {q}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sessions' && (
        <>
          {/* Outline Preview (quick view) */}
          {project.outline && (
            <div className="p-4 rounded-2xl bg-gray-100
                            shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04)]">
              <h3 className="font-medium text-slate-700 mb-2 font-heading">
                关联提纲: {project.outline.name}
              </h3>
              <div className="text-sm text-slate-600 space-y-2">
                {project.outline.content.sections.map(section => (
                  <div key={section.id}>
                    <span className="font-medium">{section.title}</span>
                    <ul className="ml-4 text-slate-500">
                      {section.questions.map((q, i) => (
                        <li key={i}>• {q}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Session List */}
          <SessionList
            project={project}
            onSelect={onSelectSession}
            onImport={onImportAudio}
            onRecord={onStartRecording}
            onSessionsLoad={handleSessionsLoad}
            refreshKey={refreshKey}
            onGenerateTable={handleProjectRefresh}
          />
        </>
      )}

      {activeTab === 'summary' && (
        <TableSummaryTab
          project={project}
          onProjectUpdate={handleProjectRefresh}
          hasCompletedSessions={hasCompletedSessions}
          sessions={sessions}
        />
      )}
    </div>
  );
}