import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import PasswordPage from './components/PasswordPage';
import NewsScoringTab from './tabs/NewsScoringTab';
import ScoredNewsTab from './tabs/ScoredNewsTab';
import MediaTab from './tabs/MediaTab';
import PitchesTab from './tabs/PitchesTab';
import PitchTrackerTab from './tabs/PitchTrackerTab';
import UsageTab from './tabs/UsageTab';
import type { PitchContext, ScoredArticle } from './types';

export type TabId = 'news-scoring' | 'scored-news' | 'media' | 'pitches' | 'tracker' | 'usage';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('news-scoring');
  const [pitchContext, setPitchContext] = useState<PitchContext | null>(null);
  const [scoredArticles, setScoredArticles] = useState<ScoredArticle[]>([]);
  const [scoringValidationNote, setScoringValidationNote] = useState<string | null>(null);

  useEffect(() => {
    const isAuth = sessionStorage.getItem('dashboard_authenticated') === 'true';
    setIsAuthenticated(isAuth);
  }, []);

  const handleAuthenticate = () => {
    sessionStorage.setItem('dashboard_authenticated', 'true');
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <PasswordPage onAuthenticate={handleAuthenticate} />;
  }

  function navigateToPitches(ctx: PitchContext) {
    setPitchContext(ctx);
    setActiveTab('pitches');
  }

  function handleTabChange(tab: TabId) {
    if (tab !== 'pitches') setPitchContext(null);
    setActiveTab(tab);
  }

  function handleScoringComplete(articles: ScoredArticle[], validationNote: string | null) {
    setScoredArticles(articles);
    setScoringValidationNote(validationNote);
    setActiveTab('scored-news');
  }

  function handleNewScoring() {
    setScoredArticles([]);
    setScoringValidationNote(null);
    setActiveTab('news-scoring');
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      <main
        className="flex-1 overflow-auto"
        style={{ marginLeft: '220px', minHeight: '100vh' }}
      >
        {activeTab === 'news-scoring' && <NewsScoringTab onScoringComplete={handleScoringComplete} />}
        {activeTab === 'scored-news'  && <ScoredNewsTab articles={scoredArticles} validationNote={scoringValidationNote} onWritePitch={navigateToPitches} onNewScoring={handleNewScoring} />}
        {activeTab === 'media'        && <MediaTab onWritePitch={navigateToPitches} />}
        {activeTab === 'pitches'      && <PitchesTab initialContext={pitchContext} />}
        {activeTab === 'tracker'      && <PitchTrackerTab />}
        {activeTab === 'usage'        && <UsageTab />}
      </main>
    </div>
  );
}
