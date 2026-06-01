import { useMemo, useState } from 'react';
import ScoreBadge from '../components/ScoreBadge';
import type { ScoredArticle, ScoreTier, PitchContext } from '../types';

type SortField = 'scoreTier' | 'publishDate';

const TIER_ORDER: Record<ScoreTier, number> = { High: 0, Medium: 1, Low: 2, Discard: 3 };

const TIER_COLORS: Record<ScoreTier, string> = {
  High: '#C8A45A', Medium: '#003E52', Low: '#6B7280', Discard: '#dc2626',
};

interface Props {
  articles: ScoredArticle[];
  validationNote: string | null;
  onWritePitch: (ctx: PitchContext) => void;
  onNewScoring: () => void;
  onForceScore: (url: string, newTier: ScoreTier) => void;
  isLoading?: boolean;
}

export default function ScoredNewsTab({ articles, validationNote, onWritePitch, onNewScoring, onForceScore, isLoading }: Props) {
  const [sortField, setSortField] = useState<SortField>('scoreTier');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScoreTiers, setSelectedScoreTiers] = useState<Set<ScoreTier>>(new Set(['High', 'Medium', 'Low']));

  const displayed = useMemo(() => {
    let filtered = articles.filter(a => a.scoreTier !== 'Discard' && a.isCanonical);
    filtered = filtered.filter(a => selectedScoreTiers.has(a.scoreTier));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.headline.toLowerCase().includes(q) ||
        a.outlet.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q)
      );
    }
    return [...filtered].sort((a, b) => {
      if (sortField === 'scoreTier') return TIER_ORDER[a.scoreTier] - TIER_ORDER[b.scoreTier];
      return (b.publishDate || '').localeCompare(a.publishDate || '');
    });
  }, [articles, sortField, searchQuery, selectedScoreTiers]);

  const discardCount = articles.filter(a => a.scoreTier === 'Discard').length;

  async function handleAddToMedia(article: ScoredArticle) {
    await fetch('/api/sheets-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tab: 'Media List',
        rows: [[
          article.outlet, article.author, '',
          'Yes', article.url, article.competitorProperty,
          article.pitchAngle, new Date().toISOString().split('T')[0],
        ]],
      }),
    });
    fetch('/api/metrics-increment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newContactsAdded: 1 }),
    }).catch(() => {});
  }

  const counts = {
    high: displayed.filter(a => a.scoreTier === 'High').length,
    medium: displayed.filter(a => a.scoreTier === 'Medium').length,
    low: displayed.filter(a => a.scoreTier === 'Low').length,
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 style={{ color: '#003E52', marginBottom: '0.25rem' }}>Scored Articles</h2>
          <div className="flex gap-4 text-sm">
            <span style={{ color: '#C8A45A' }}>{counts.high} High</span>
            <span style={{ color: '#003E52' }}>{counts.medium} Medium</span>
            <span style={{ color: '#6B7280' }}>{counts.low} Low</span>
            {discardCount > 0 && <span style={{ color: '#94a3b8' }}>{discardCount} Discarded</span>}
          </div>
        </div>
        <button className="btn-secondary text-sm" onClick={onNewScoring}>
          + New Scoring
        </button>
      </div>

      {validationNote && (
        <div
          className="rounded-lg px-4 py-3 mb-6 text-sm flex items-start gap-3"
          style={{ backgroundColor: 'rgba(200,164,90,0.1)', borderLeft: '3px solid #C8A45A' }}
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#C8A45A" strokeWidth={1.5} className="flex-shrink-0 mt-0.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span style={{ color: '#003E52' }}>{validationNote}</span>
        </div>
      )}

      <div className="mb-6 space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search articles, outlets, authors..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 border rounded-lg px-4 py-2 text-sm"
            style={{ borderColor: '#E5E7EB', color: '#003E52' }}
          />
          <select
            value={sortField}
            onChange={e => setSortField(e.target.value as SortField)}
            className="border rounded-lg px-3 py-2 text-sm"
            style={{ borderColor: '#E5E7EB', color: '#003E52' }}
          >
            <option value="scoreTier">Sort: Score Tier</option>
            <option value="publishDate">Sort: Publish Date</option>
          </select>
        </div>
        <div className="flex gap-2">
          {(['High', 'Medium', 'Low'] as const).map(tier => (
            <button
              key={tier}
              onClick={() => {
                const newTiers = new Set(selectedScoreTiers);
                if (newTiers.has(tier)) newTiers.delete(tier);
                else newTiers.add(tier);
                setSelectedScoreTiers(newTiers);
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all border"
              style={{
                backgroundColor: selectedScoreTiers.has(tier) ? TIER_COLORS[tier] : '#ffffff',
                color: selectedScoreTiers.has(tier) ? '#ffffff' : TIER_COLORS[tier],
                borderColor: TIER_COLORS[tier],
              }}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      {isLoading && articles.length === 0 ? (
        <div className="text-center py-12">
          <p style={{ color: '#6B7280' }}>Loading scored articles…</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12">
          <p style={{ color: '#6B7280' }}>
            {searchQuery ? 'No articles match your search.' : selectedScoreTiers.size === 0 ? 'Select a score tier to view articles.' : 'No scored articles yet. Start a new scoring to see results here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map((article, idx) => (
            <ArticleCard
              key={idx}
              article={article}
              onAddToMedia={() => handleAddToMedia(article)}
              onForceScore={(newTier, reason) => onForceScore(article.url, newTier)}
              onWritePitch={() => onWritePitch({
                journalistName: article.author,
                outlet: article.outlet,
                competitorProperty: article.competitorProperty,
                articleHeadline: article.headline,
                articleUrl: article.url,
                pitchAngle: article.pitchAngle,
              })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  article: ScoredArticle;
  onAddToMedia: () => void;
  onForceScore: (newTier: ScoreTier, reason: string) => void;
  onWritePitch: () => void;
}

function ArticleCard({ article, onAddToMedia, onForceScore, onWritePitch }: CardProps) {
  const [addedToMedia, setAddedToMedia] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [pendingTier, setPendingTier] = useState<ScoreTier | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAddToMedia() {
    await onAddToMedia();
    setAddedToMedia(true);
  }

  function openOverride() {
    setOverrideOpen(true);
    setPendingTier(null);
    setOverrideReason('');
  }

  function closeOverride() {
    setOverrideOpen(false);
    setPendingTier(null);
    setOverrideReason('');
  }

  async function applyOverride() {
    if (!pendingTier) return;
    setSaving(true);
    try {
      onForceScore(pendingTier, overrideReason);
      await fetch('/api/sheets-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: 'Scoring Corrections',
          rows: [[
            article.headline,
            article.url,
            article.scoreTier,
            pendingTier,
            overrideReason.trim() || 'Manual override',
            new Date().toISOString(),
          ]],
        }),
      });
      closeOverride();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}
    >
      {/* Clickable header — always visible */}
      <button
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-4 hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <span
            className="font-medium leading-snug block"
            style={{ color: '#003E52', fontFamily: 'Georgia, serif' }}
          >
            {article.headline}
          </span>
          <div className="flex flex-wrap gap-2 mt-1.5 text-xs" style={{ color: '#6B7280' }}>
            <span>{article.outlet}</span>
            {article.author && <><span>·</span><span>{article.author}</span></>}
            {article.uvm && <><span>·</span><span>UVM: {Number(article.uvm).toLocaleString()}</span></>}
            {article.publishDate && <><span>·</span><span>{article.publishDate}</span></>}
          </div>
          {article.competitorProperty && (
            <span
              className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: 'rgba(200,164,90,0.15)', color: '#8a6a1a' }}
            >
              Competitor: {article.competitorProperty}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Score badge — click to change score */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              title="Change score"
              onClick={openOverride}
              className="flex items-center gap-1 rounded focus:outline-none"
            >
              <ScoreBadge tier={article.scoreTier} />
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
              </svg>
            </button>

            {overrideOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-20 rounded-lg shadow-lg"
                style={{ border: '1px solid #E5E7EB', backgroundColor: '#fff', width: '220px' }}
              >
                {!pendingTier ? (
                  /* Phase 1: pick a tier */
                  <>
                    <p className="px-3 py-2 text-xs font-semibold" style={{ color: '#6B7280', borderBottom: '1px solid #F3F4F6' }}>
                      Change score
                    </p>
                    {(['High', 'Medium', 'Low', 'Discard'] as ScoreTier[]).map(tier => (
                      <button
                        key={tier}
                        className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors"
                        style={{
                          color: tier === article.scoreTier ? '#003E52' : '#374151',
                          fontWeight: tier === article.scoreTier ? 600 : 400,
                        }}
                        onClick={() => setPendingTier(tier)}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: TIER_COLORS[tier] }}
                        />
                        {tier}
                        {tier === article.scoreTier && (
                          <span className="ml-auto text-xs" style={{ color: '#9ca3af' }}>current</span>
                        )}
                      </button>
                    ))}
                    <div style={{ borderTop: '1px solid #F3F4F6' }}>
                      <button
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
                        style={{ color: '#9ca3af' }}
                        onClick={closeOverride}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  /* Phase 2: optional reason + confirm */
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: TIER_COLORS[pendingTier] }}
                      />
                      <span className="text-sm font-semibold" style={{ color: '#003E52' }}>{pendingTier}</span>
                      <button
                        className="ml-auto text-xs"
                        style={{ color: '#9ca3af' }}
                        onClick={() => setPendingTier(null)}
                      >
                        ← back
                      </button>
                    </div>
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') applyOverride(); if (e.key === 'Escape') closeOverride(); }}
                      placeholder="Reason for Claude (optional)"
                      autoFocus
                      className="w-full border rounded px-2 py-1.5 text-xs"
                      style={{ borderColor: '#E5E7EB', color: '#003E52' }}
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn-primary text-xs px-3 py-1.5 flex-1"
                        disabled={saving}
                        onClick={applyOverride}
                      >
                        {saving ? 'Saving…' : 'Apply'}
                      </button>
                      <button className="btn-secondary text-xs px-3 py-1.5" onClick={closeOverride}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {article.knownContact && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}
            >
              Known Contact
            </span>
          )}
          {article.syndicationCount > 0 && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}
            >
              Syndicated ×{article.syndicationCount}
            </span>
          )}
          <svg
            width="16" height="16" fill="none" viewBox="0 0 24 24"
            stroke="#6B7280" strokeWidth={2}
            className="transition-transform flex-shrink-0"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div className="px-5 pb-5 space-y-3 border-t" style={{ borderColor: '#F3F4F6' }}>
          <div className="flex gap-4 pt-3 text-xs">
            {article.articleType && (
              <div>
                <span style={{ color: '#6B7280' }}>Type: </span>
                <span style={{ color: '#003E52' }}>{article.articleType}</span>
              </div>
            )}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: '#6B7280' }}
              onClick={e => e.stopPropagation()}
            >
              Open article ↗
            </a>
          </div>

          {article.scoringExplanation && (
            <p className="text-sm" style={{ color: '#475569' }}>{article.scoringExplanation}</p>
          )}

          {article.pitchAngle && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: 'rgba(200,164,90,0.08)', borderLeft: '3px solid #C8A45A' }}
            >
              <span className="font-semibold" style={{ color: '#C8A45A' }}>Pitch angle: </span>
              <span style={{ color: '#003E52' }}>{article.pitchAngle}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button className="btn-primary text-xs px-3 py-1.5" onClick={onWritePitch}>
              Write Pitch
            </button>
            <button
              className="btn-secondary text-xs px-3 py-1.5"
              onClick={handleAddToMedia}
              disabled={addedToMedia}
              style={{ opacity: addedToMedia ? 0.6 : 1 }}
            >
              {addedToMedia ? 'Added ✓' : 'Add to Media List'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
