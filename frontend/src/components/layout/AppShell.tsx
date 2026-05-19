import { useState } from 'react';
import { NavBar } from './NavBar';
import { ProjectList } from '../projects/ProjectList';
import { ProjectEditor } from '../projects/ProjectEditor';
import { ProjectWithOutlineCreator } from '../projects/ProjectWithOutlineCreator';
import { ProjectDetailTabs } from '../projects/ProjectDetailTabs';
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
  const [refreshKey, setRefreshKey] = useState(0);

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

  const handleProjectUpdate = (project: Project) => {
    setSelectedProject(project);
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
    // 触发 SessionList 重新加载
    setRefreshKey(prev => prev + 1);
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
              <ProjectDetailTabs
                project={selectedProject}
                onSelectSession={handleSelectSession}
                onImportAudio={handleImportAudio}
                onStartRecording={handleStartRecording}
                onSessionsLoad={setSessions}
                onEditProject={handleEditProject}
                onOpenExport={handleOpenExport}
                onBack={handleBackToProjects}
                refreshKey={refreshKey}
                onProjectUpdate={handleProjectUpdate}
              />
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