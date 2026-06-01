import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import PasswordPage from './components/PasswordPage';
import NewsScoringTab from './tabs/NewsScoringTab';
import ScoredNewsTab from './tabs/ScoredNewsTab';
import MediaTab from './tabs/MediaTab';
import PitchesTab from './tabs/PitchesTab';
import PitchTrackerTab from './tabs/PitchTrackerTab';
import UsageTab from './tabs/UsageTab';
import type { PitchContext, ScoredArticle, ScoreTier } from './types';

export type TabId = 'news-scoring' | 'scored-news' | 'media' | 'pitches' | 'tracker' | 'usage';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('news-scoring');
  const [pitchContext, setPitchContext] = useState<PitchContext | null>(null);
  const [scoredArticles, setScoredArticles] = useState<ScoredArticle[]>([]);
  const [scoringValidationNote, setScoringValidationNote] = useState<string | null>(null);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);

  useEffect(() => {
    const isAuth = sessionStorage.getItem('dashboard_authenticated') === 'true';
    setIsAuthenticated(isAuth);
  }, []);

  useEffect(() => {
    if (activeTab !== 'scored-news') return;
    setIsLoadingArticles(true);
    fetch('/api/sheets-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab: 'Scored Articles Log', asObjects: true }),
    })
      .then(r => r.json())
      .then(data => {
        const rows = (data.rows ?? []) as Record<string, string>[];
        const articles: ScoredArticle[] = rows.map(row => ({
          headline: row['Headline'] ?? '',
          url: row['Article URL'] ?? '',
          author: row['Author'] ?? '',
          outlet: row['Outlet'] ?? '',
          publishDate: row['Upload Date'] ?? '',
          uvm: row['UVM'] ?? '',
          scoreTier: (row['Score Tier'] as ScoreTier) ?? 'Low',
          articleType: row['Article Type'] ?? '',
          competitorProperty: row['Competitor Property'] ?? '',
          scoringExplanation: row['Scoring Explanation'] ?? '',
          pitchAngle: row['Pitch Angle'] ?? '',
          syndicationCount: parseInt(row['Syndication Count'] ?? '0', 10) || 0,
          knownContact: row['Known Contact'] === 'Yes',
          isCanonical: true,
        }));
        setScoredArticles(articles);
      })
      .catch(() => {})
      .finally(() => setIsLoadingArticles(false));
  }, [activeTab]);

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

  function handleScoringComplete(_articles: ScoredArticle[], validationNote: string | null) {
    setScoringValidationNote(validationNote);
    setActiveTab('scored-news');
  }

  function handleNewScoring() {
    setScoredArticles([]);
    setScoringValidationNote(null);
    setActiveTab('news-scoring');
  }

  function handleForceScore(url: string, newTier: ScoreTier) {
    setScoredArticles(prev => prev.map(a => a.url === url ? { ...a, scoreTier: newTier } : a));
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      <main
        className="flex-1 overflow-auto"
        style={{ marginLeft: '220px', minHeight: '100vh' }}
      >
        {/* NewsScoringTab stays mounted to preserve in-progress scoring state */}
        <div style={{ display: activeTab === 'news-scoring' ? 'block' : 'none' }}>
          <NewsScoringTab onScoringComplete={handleScoringComplete} />
        </div>
        {activeTab === 'scored-news'  && <ScoredNewsTab articles={scoredArticles} validationNote={scoringValidationNote} onWritePitch={navigateToPitches} onNewScoring={handleNewScoring} onForceScore={handleForceScore} isLoading={isLoadingArticles} />}
        {activeTab === 'media'        && <MediaTab onWritePitch={navigateToPitches} />}
        {activeTab === 'pitches'      && <PitchesTab initialContext={pitchContext} />}
        {activeTab === 'tracker'      && <PitchTrackerTab />}
        {activeTab === 'usage'        && <UsageTab />}
      </main>
    </div>
  );
}
