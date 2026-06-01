import { useMemo, useState } from 'react';
import ScoreBadge from '../components/ScoreBadge';
import type { ScoredArticle, ScoreTier, PitchContext } from '../types';

type SortField = 'scoreTier' | 'publishDate';

const TIER_ORDER: Record<ScoreTier, number> = { High: 0, Medium: 1, Low: 2, Discard: 3 };

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
  const [correctionOpen, setCorrectionOpen] = useState<number | null>(null);
  const [correctionScore, setCorrectionScore] = useState<ScoreTier>('Medium');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);

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

  async function submitCorrection(article: ScoredArticle) {
    if (!correctionReason.trim()) return;
    setCorrectionSubmitting(true);
    try {
      await fetch('/api/sheets-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: 'Scoring Corrections',
          rows: [[
            article.headline,
            article.url,
            article.scoreTier,
            correctionScore,
            correctionReason,
            new Date().toISOString(),
          ]],
        }),
      });
      setCorrectionOpen(null);
      setCorrectionReason('');
    } finally {
      setCorrectionSubmitting(false);
    }
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
                if (newTiers.has(tier)) {
                  newTiers.delete(tier);
                } else {
                  newTiers.add(tier);
                }
                setSelectedScoreTiers(newTiers);
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all border"
              style={{
                backgroundColor: selectedScoreTiers.has(tier) ? (tier === 'High' ? '#C8A45A' : tier === 'Medium' ? '#003E52' : '#6B7280') : '#ffffff',
                color: selectedScoreTiers.has(tier) ? '#ffffff' : (tier === 'High' ? '#C8A45A' : tier === 'Medium' ? '#003E52' : '#6B7280'),
                borderColor: tier === 'High' ? '#C8A45A' : tier === 'Medium' ? '#003E52' : '#6B7280',
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
              idx={idx}
              correctionOpen={correctionOpen === idx}
              onToggleCorrection={() => setCorrectionOpen(correctionOpen === idx ? null : idx)}
              correctionScore={correctionScore}
              onCorrectionScore={setCorrectionScore}
              correctionReason={correctionReason}
              onCorrectionReason={setCorrectionReason}
              correctionSubmitting={correctionSubmitting}
              onSubmitCorrection={() => submitCorrection(article)}
              onAddToMedia={() => handleAddToMedia(article)}
              onForceScore={(newTier) => onForceScore(article.url, newTier)}
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
  idx: number;
  correctionOpen: boolean;
  onToggleCorrection: () => void;
  correctionScore: ScoreTier;
  onCorrectionScore: (s: ScoreTier) => void;
  correctionReason: string;
  onCorrectionReason: (r: string) => void;
  correctionSubmitting: boolean;
  onSubmitCorrection: () => void;
  onAddToMedia: () => void;
  onForceScore: (newTier: ScoreTier) => void;
  onWritePitch: () => void;
}

const TIER_COLORS: Record<ScoreTier, { bg: string; text: string; label: string }> = {
  High:    { bg: '#C8A45A', text: '#fff',     label: 'High' },
  Medium:  { bg: '#003E52', text: '#fff',     label: 'Medium' },
  Low:     { bg: '#6B7280', text: '#fff',     label: 'Low' },
  Discard: { bg: '#fee2e2', text: '#991b1b',  label: 'Discard' },
};

function ArticleCard({
  article, correctionOpen, onToggleCorrection,
  correctionScore, onCorrectionScore,
  correctionReason, onCorrectionReason,
  correctionSubmitting, onSubmitCorrection,
  onAddToMedia, onForceScore, onWritePitch,
}: CardProps) {
  const [addedToMedia, setAddedToMedia] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  async function handleAddToMedia() {
    await onAddToMedia();
    setAddedToMedia(true);
  }

  async function handleForceScore(newTier: ScoreTier) {
    setOverrideOpen(false);
    onForceScore(newTier);
    fetch('/api/sheets-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tab: 'Scoring Corrections',
        rows: [[
          article.headline,
          article.url,
          article.scoreTier,
          newTier,
          'Manual override',
          new Date().toISOString(),
        ]],
      }),
    }).catch(() => {});
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
          {/* Competitor pill — visible even when collapsed */}
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
          {/* Score badge with override dropdown */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              title="Override score"
              onClick={() => setOverrideOpen(v => !v)}
              className="flex items-center gap-1 rounded focus:outline-none"
              style={{ opacity: 1 }}
            >
              <ScoreBadge tier={article.scoreTier} />
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
              </svg>
            </button>
            {overrideOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-20 rounded-lg shadow-lg overflow-hidden"
                style={{ border: '1px solid #E5E7EB', backgroundColor: '#fff', minWidth: '110px' }}
              >
                <p className="px-3 py-1.5 text-xs font-semibold" style={{ color: '#6B7280', borderBottom: '1px solid #F3F4F6' }}>
                  Override score
                </p>
                {(['High', 'Medium', 'Low', 'Discard'] as ScoreTier[]).map(tier => (
                  <button
                    key={tier}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors"
                    style={{ color: tier === article.scoreTier ? '#003E52' : '#374151', fontWeight: tier === article.scoreTier ? 600 : 400 }}
                    onClick={() => handleForceScore(tier)}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: TIER_COLORS[tier].bg }}
                    />
                    {tier}
                    {tier === article.scoreTier && <span className="ml-auto text-xs" style={{ color: '#9ca3af' }}>current</span>}
                  </button>
                ))}
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
          {/* Metadata row */}
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

          {/* Scoring explanation */}
          {article.scoringExplanation && (
            <p className="text-sm" style={{ color: '#475569' }}>{article.scoringExplanation}</p>
          )}

          {/* Pitch angle */}
          {article.pitchAngle && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: 'rgba(200,164,90,0.08)', borderLeft: '3px solid #C8A45A' }}
            >
              <span className="font-semibold" style={{ color: '#C8A45A' }}>Pitch angle: </span>
              <span style={{ color: '#003E52' }}>{article.pitchAngle}</span>
            </div>
          )}

          {/* Action buttons */}
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
            <button
              className="text-xs px-3 py-1.5 rounded border transition-colors"
              style={{
                borderColor: correctionOpen ? '#C8A45A' : '#E5E7EB',
                color: correctionOpen ? '#C8A45A' : '#6B7280',
              }}
              onClick={onToggleCorrection}
            >
              Scoring Needs Correction?
            </button>
          </div>

          {/* Correction form */}
          {correctionOpen && (
            <div
              className="rounded-lg p-4 space-y-3 mt-2"
              style={{ backgroundColor: '#F8F5F0', border: '1px solid #E5E7EB' }}
            >
              <p className="text-xs font-semibold" style={{ color: '#003E52' }}>Submit Scoring Correction</p>
              <div className="flex gap-3 items-end">
                <div>
                  <label className="text-xs" style={{ color: '#6B7280' }}>Corrected Score</label>
                  <select
                    value={correctionScore}
                    onChange={e => onCorrectionScore(e.target.value as ScoreTier)}
                    className="block mt-1 border rounded px-3 py-1.5 text-sm"
                    style={{ borderColor: '#E5E7EB', color: '#003E52' }}
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                    <option>Discard</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs" style={{ color: '#6B7280' }}>Reason (required)</label>
                  <input
                    type="text"
                    value={correctionReason}
                    onChange={e => onCorrectionReason(e.target.value)}
                    placeholder="Why should this be re-scored?"
                    className="block w-full mt-1 border rounded px-3 py-1.5 text-sm"
                    style={{ borderColor: '#E5E7EB', color: '#003E52' }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-primary text-xs px-3 py-1.5"
                  disabled={!correctionReason.trim() || correctionSubmitting}
                  onClick={onSubmitCorrection}
                >
                  {correctionSubmitting ? 'Saving...' : 'Submit'}
                </button>
                <button className="btn-secondary text-xs px-3 py-1.5" onClick={onToggleCorrection}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
