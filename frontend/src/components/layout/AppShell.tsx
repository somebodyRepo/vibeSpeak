import { useState } from 'react';
import { NavBar } from './NavBar';
import { ProjectList } from '../projects/ProjectList';
import { ProjectEditor } from '../projects/ProjectEditor';
import { ProjectWithOutlineCreator } from '../projects/ProjectWithOutlineCreator';
import { SessionList } from '../sessions/SessionList';
import { SessionViewer } from '../sessions/SessionViewer';
import { SessionImporter } from '../sessions/SessionImporter';
import { SessionRecorder } from '../sessions/SessionRecorder';
import { ExportPanel } from '../export/ExportPanel';
import type { Project, InterviewSession } from '../../types';

type View =
  | 'project-list'
  | 'project-new'
  | 'project-edit'
  | 'project-detail'
  | 'session-detail'
  | 'recording';

export function AppShell() {
  const [activeTab, setActiveTab] = useState<'projects' | 'record'>('projects');
  const [view, setView] = useState<View>('project-list');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setView('project-detail');
  };

  const handleSelectSession = (session: InterviewSession) => {
    setSelectedSession(session.id);
    setView('session-detail');
  };

  const handleNewProject = () => {
    setSelectedProject(null);
    setView('project-new');
  };

  const handleEditProject = () => {
    if (selectedProject) {
      setView('project-edit');
    }
  };

  const handleSaveProject = (project: Project) => {
    setSelectedProject(project);
    setView('project-detail');
  };

  const handleImportAudio = () => {
    setShowImporter(true);
  };

  const handleBackToProjects = () => {
    setSelectedProject(null);
    setView('project-list');
  };

  const handleBackToProject = () => {
    setSelectedSession(null);
    setView('project-detail');
  };

  const handleImportComplete = () => {
    // 刷新会话列表
  };

  const handleStartRecording = () => {
    setView('recording');
  };

  const handleRecordingComplete = (_sessionId: string) => {
    setView('project-detail');
  };

  const handleOpenExport = () => {
    setShowExport(true);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-body">
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="container mx-auto max-w-6xl px-4 md:px-6 lg:px-8 py-6">
        {activeTab === 'projects' && (
          <>
            {view === 'project-list' && (
              <ProjectList
                onSelect={handleSelectProject}
                onNewProject={handleNewProject}
              />
            )}

            {view === 'project-new' && (
              <ProjectWithOutlineCreator
                onSave={handleSaveProject}
                onCancel={handleBackToProjects}
              />
            )}

            {view === 'project-edit' && selectedProject && (
              <ProjectEditor
                project={selectedProject}
                onSave={handleSaveProject}
                onCancel={handleBackToProject}
              />
            )}

            {view === 'project-detail' && selectedProject && (
              <div className="space-y-6">
                {/* Project Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleBackToProjects}
                      className="p-2 rounded-lg text-slate-500 hover:bg-gray-100 cursor-pointer"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div>
                      <h1 className="text-xl font-heading font-semibold text-slate-800">
                        {selectedProject.name}
                      </h1>
                      <p className="text-sm text-slate-500">
                        {selectedProject.description || '暂无描述'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleOpenExport}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600
                                 bg-gray-100 hover:bg-gray-200 cursor-pointer"
                    >
                      批量导出
                    </button>
                    <button
                      onClick={handleEditProject}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600
                                 bg-gray-100 hover:bg-gray-200 cursor-pointer"
                    >
                      编辑项目
                    </button>
                  </div>
                </div>

                {/* Outline Preview */}
                {selectedProject.outline && (
                  <div className="p-4 rounded-2xl bg-gray-100
                                  shadow-[inset_3px_3px_8px_rgba(0,0,0,0.04)]">
                    <h3 className="font-medium text-slate-700 mb-2 font-heading">
                      关联提纲: {selectedProject.outline.name}
                    </h3>
                    <div className="text-sm text-slate-600 space-y-2">
                      {selectedProject.outline.content.sections.map(section => (
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
                  project={selectedProject}
                  onSelect={handleSelectSession}
                  onImport={handleImportAudio}
                  onRecord={handleStartRecording}
                  onSessionsLoad={setSessions}
                />
              </div>
            )}

            {view === 'recording' && selectedProject && (
              <SessionRecorder
                project={selectedProject}
                onComplete={handleRecordingComplete}
                onCancel={() => setView('project-detail')}
              />
            )}

            {view === 'session-detail' && selectedSession && (
              <SessionViewer
                sessionId={selectedSession}
                onBack={handleBackToProject}
              />
            )}

            {/* Import Modal */}
            {showImporter && selectedProject && (
              <SessionImporter
                projectId={selectedProject.id}
                onComplete={handleImportComplete}
                onClose={() => setShowImporter(false)}
              />
            )}

            {/* Export Modal */}
            {showExport && selectedProject && (
              <ExportPanel
                project={selectedProject}
                sessions={sessions}
                onClose={() => setShowExport(false)}
              />
            )}
          </>
        )}

        {activeTab === 'record' && (
          <>
            {view === 'recording' && selectedProject ? (
              <SessionRecorder
                project={selectedProject}
                onComplete={handleRecordingComplete}
                onCancel={() => {
                  setView('project-list');
                  setActiveTab('projects');
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 rounded-2xl bg-gray-100 text-slate-500">
                {selectedProject ? (
                  <div className="text-center">
                    <p className="text-lg font-medium text-slate-700 mb-2">
                      {selectedProject.name}
                    </p>
                    <button
                      onClick={handleStartRecording}
                      className="px-6 py-3 rounded-xl text-sm font-medium text-white
                                 bg-gradient-to-r from-orange-400 to-orange-500
                                 shadow-[0_4px_12px_rgba(251,146,60,0.3)]
                                 hover:shadow-[0_6px_20px_rgba(251,146,60,0.4)]
                                 transition-all duration-200 cursor-pointer"
                    >
                      开始录音
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-medium">请先选择一个项目</p>
                    <p className="text-sm mt-2">在项目管理中选择项目后可开始录音</p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}