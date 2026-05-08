interface NavBarProps {
  activeTab: 'projects' | 'record';
  onTabChange: (tab: 'projects' | 'record') => void;
}

export function NavBar({ activeTab, onTabChange }: NavBarProps) {
  return (
    <nav className="sticky top-4 mx-4 rounded-2xl bg-white/80 backdrop-blur-sm
                    shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
      <div className="px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl
                            bg-gradient-to-br from-blue-500 to-purple-500
                            shadow-[0_2px_8px_rgba(59,130,246,0.3)]">
              <svg
                className="h-5 w-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <span className="text-xl font-heading font-semibold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              vibeSpeak
            </span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-gray-100
                          shadow-[inset_2px_2px_4px_rgba(0,0,0,0.06)]">
            <button
              onClick={() => onTabChange('projects')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium font-body transition-all duration-200 cursor-pointer ${
                activeTab === 'projects'
                  ? 'bg-white text-blue-600 shadow-[2px_2px_6px_rgba(0,0,0,0.06),-2px_-2px_6px_rgba(255,255,255,0.8)]'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              项目管理
            </button>
            <button
              onClick={() => onTabChange('record')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium font-body transition-all duration-200 cursor-pointer ${
                activeTab === 'record'
                  ? 'bg-white text-orange-600 shadow-[2px_2px_6px_rgba(0,0,0,0.06),-2px_-2px_6px_rgba(255,255,255,0.8)]'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              实时录音
            </button>
          </div>

          {/* Settings */}
          <button className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400
                             bg-gray-100
                             shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)]
                             hover:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.06)]
                             transition-all duration-200 cursor-pointer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}