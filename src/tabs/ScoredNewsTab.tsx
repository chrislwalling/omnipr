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
}

export default function ScoredNewsTab({ articles, validationNote, onWritePitch, onNewScoring }: Props) {
  const [sortField, setSortField] = useState<SortField>('scoreTier');
  const [searchQuery, setSearchQuery] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState<number | null>(null);
  const [correctionScore, setCorrectionScore] = useState<ScoreTier>('Medium');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);

  const displayed = useMemo(() => {
    let filtered = articles.filter(a => a.scoreTier !== 'Discard' && a.isCanonical);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.headline.toLowerCase().includes(q) ||
        a.outlet.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        a.url.toLowerCase().includes(q)
      );
    }

    return [...filtered].sort((a, b) => {
      if (sortField === 'scoreTier') return TIER_ORDER[a.scoreTier] - TIER_ORDER[b.scoreTier];
      return (b.publishDate || '').localeCompare(a.publishDate || '');
    });
  }, [articles, sortField, searchQuery]);

  const discardCount = articles.filter(a => a.scoreTier === 'Discard').length;

  async function handleAddToMedia(article: ScoredArticle) {
    const nameParts = article.author.trim().split(' ');
    const first = nameParts[0] || '';
    const last = nameParts.slice(1).join(' ') || '';
    await fetch('/api/sheets-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tab: 'Media List',
        rows: [[
          article.outlet, first, last, '',
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

      <div className="mb-6 flex gap-3">
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

      {displayed.length === 0 ? (
        <div className="text-center py-12">
          <p style={{ color: '#6B7280' }}>
            {searchQuery ? 'No articles match your search.' : 'No scored articles yet. Start a new scoring to see results here.'}
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
  onWritePitch: () => void;
}

function ArticleCard({
  article, correctionOpen, onToggleCorrection,
  correctionScore, onCorrectionScore,
  correctionReason, onCorrectionReason,
  correctionSubmitting, onSubmitCorrection,
  onAddToMedia, onWritePitch,
}: CardProps) {
  const [addedToMedia, setAddedToMedia] = useState(false);

  async function handleAddToMedia() {
    await onAddToMedia();
    setAddedToMedia(true);
  }

  return (
    <div
      className="rounded-xl p-5 space-y-3"
      style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline leading-snug"
            style={{ color: '#003E52', fontFamily: 'Georgia, serif' }}
          >
            {article.headline}
          </a>
          <div className="flex flex-wrap gap-2 mt-1.5 text-xs" style={{ color: '#6B7280' }}>
            <span>{article.outlet}</span>
            {article.author && <><span>·</span><span>{article.author}</span></>}
            {article.uvm && <><span>·</span><span>UVM: {Number(article.uvm).toLocaleString()}</span></>}
            {article.publishDate && <><span>·</span><span>{article.publishDate}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ScoreBadge tier={article.scoreTier} />
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
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {article.articleType && (
          <div>
            <span style={{ color: '#6B7280' }}>Type: </span>
            <span style={{ color: '#003E52' }}>{article.articleType}</span>
          </div>
        )}
        {article.competitorProperty && (
          <div>
            <span style={{ color: '#6B7280' }}>Competitor: </span>
            <span style={{ color: '#003E52' }}>{article.competitorProperty}</span>
          </div>
        )}
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
  );
}
