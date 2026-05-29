import { useState } from 'react';
import Sidebar from './components/Sidebar';
import NewsTab from './tabs/NewsTab';
import MediaTab from './tabs/MediaTab';
import PitchesTab from './tabs/PitchesTab';
import PitchTrackerTab from './tabs/PitchTrackerTab';
import type { PitchContext } from './types';

export type TabId = 'news' | 'media' | 'pitches' | 'tracker';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('news');
  const [pitchContext, setPitchContext] = useState<PitchContext | null>(null);

  function navigateToPitches(ctx: PitchContext) {
    setPitchContext(ctx);
    setActiveTab('pitches');
  }

  function handleTabChange(tab: TabId) {
    if (tab !== 'pitches') setPitchContext(null);
    setActiveTab(tab);
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      <main
        className="flex-1 overflow-auto"
        style={{ marginLeft: '220px', minHeight: '100vh' }}
      >
        {activeTab === 'news' && <NewsTab onWritePitch={navigateToPitches} />}
        {activeTab === 'media' && <MediaTab onWritePitch={navigateToPitches} />}
        {activeTab === 'pitches' && <PitchesTab initialContext={pitchContext} />}
        {activeTab === 'tracker' && <PitchTrackerTab />}
      </main>
    </div>
  );
}
