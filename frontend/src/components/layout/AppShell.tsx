import { useState } from 'react';
import { NavBar } from './NavBar';
import { RealtimePanel } from '../realtime/RealtimePanel';
import { BatchPanel } from '../batch/BatchPanel';

type Tab = 'realtime' | 'batch';

export function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>('realtime');

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-gray-200">
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="container mx-auto max-w-6xl px-4 py-6">
        {activeTab === 'realtime' ? <RealtimePanel /> : <BatchPanel />}
      </main>
    </div>
  );
}
