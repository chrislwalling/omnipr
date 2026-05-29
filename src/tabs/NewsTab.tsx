import { useRef, useState, DragEvent, ChangeEvent, useMemo } from 'react';
import ScoreBadge from '../components/ScoreBadge';
import type { ScoredArticle, ScoreTier, PitchContext } from '../types';

type Phase = 'upload' | 'analyzing' | 'scored';
type SortField = 'scoreTier' | 'publishDate';

const TIER_ORDER: Record<ScoreTier, number> = { High: 0, Medium: 1, Low: 2, Discard: 3 };

function incrementMetrics(payload: Record<string, number>) {
  fetch('/api/metrics-increment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

interface Props {
  onWritePitch: (ctx: PitchContext) => void;
}

export default function NewsTab({ onWritePitch }: Props) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [articles, setArticles] = useState<ScoredArticle[]>([]);
  const [sortField, setSortField] = useState<SortField>('scoreTier');
  const [correctionOpen, setCorrectionOpen] = useState<number | null>(null);
  const [correctionScore, setCorrectionScore] = useState<ScoreTier>('Medium');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [validationNote, setValidationNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setError(null); }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
  }

  async function handleAnalyze() {
    if (!file) return;
    setPhase('analyzing');
    setError(null);
    try {
      setProgressLabel('Parsing file...');
      setProgress(20);

      const formData = new FormData();
      formData.append('file', file);
      const importRes = await fetch('/api/muckrack-import', { method: 'POST', body: formData });
      if (!importRes.ok) {
        const b = await importRes.json().catch(() => ({}));
        const msg = b.details ? `${b.error} — ${b.details}` : (b.error ?? `Import failed (${importRes.status})`);
        throw new Error(msg);
      }
      const { articles: parsed } = await importRes.json();
      setProgress(50);

      setProgressLabel('Scoring articles with Claude...');
      setProgress(60);

      const scoreRes = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: parsed }),
      });
      if (!scoreRes.ok) {
        const b = await scoreRes.json().catch(() => ({}));
        throw new Error(b.error ?? `Scoring failed (${scoreRes.status})`);
      }
      const { scored, counts, validationNote: note } = await scoreRes.json();
      setValidationNote(note || null);
      setProgress(90);

      // Fire Slack (non-blocking)
      fetch('/api/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(counts),
      }).catch(() => {});

      // Increment My Metrics (non-blocking)
      incrementMetrics({ articlesScored: scored.length });

      setProgress(100);
      setArticles(scored);
      setPhase('scored');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
      setPhase('upload');
      setProgress(0);
    }
  }

  const displayed = useMemo(() => {
    const visible = articles.filter(a => a.scoreTier !== 'Discard' && a.isCanonical);
    return [...visible].sort((a, b) => {
      if (sortField === 'scoreTier') return TIER_ORDER[a.scoreTier] - TIER_ORDER[b.scoreTier];
      return (b.publishDate || '').localeCompare(a.publishDate || '');
    });
  }, [articles, sortField]);

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
    // Increment My Metrics (non-blocking)
    incrementMetrics({ newContactsAdded: 1 });
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

  // ── Phase: Upload ──────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div className="p-8">
        <h2 style={{ color: '#003E52', marginBottom: '1.5rem' }}>News</h2>
        <div className="max-w-2xl mx-auto">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setDragging(false); }}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-xl flex flex-col items-center justify-center gap-3 py-16 px-8 transition-colors"
            style={{
              border: `2px dashed ${dragging ? '#C8A45A' : '#6B7280'}`,
              backgroundColor: dragging ? 'rgba(200,164,90,0.06)' : '#fff',
              minHeight: '220px',
            }}
          >
            <svg width="44" height="44" fill="none" viewBox="0 0 24 24"
              stroke={dragging ? '#C8A45A' : '#6B7280'} strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-base font-medium" style={{ color: dragging ? '#C8A45A' : '#003E52' }}>
              Drop your Muck Rack CSV export here
            </p>
            <p className="text-sm" style={{ color: '#6B7280' }}>or click to browse (.csv, .xlsx)</p>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
          </div>

          {file && (
            <div className="mt-4 flex items-center gap-3 rounded-lg px-4 py-3" style={{ background: '#E5E7EB' }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#003E52" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="text-sm font-medium" style={{ color: '#003E52' }}>{file.name}</span>
              <button className="ml-auto text-xs" style={{ color: '#6B7280' }}
                onClick={e => { e.stopPropagation(); setFile(null); if (inputRef.current) inputRef.current.value = ''; }}>
                Remove
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button className="btn-primary" disabled={!file} onClick={handleAnalyze}>
              Analyze
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase: Analyzing ────────────────────────────────────────────
  if (phase === 'analyzing') {
    return (
      <div className="p-8 flex flex-col items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center animate-pulse"
            style={{ backgroundColor: 'rgba(200,164,90,0.2)' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#C8A45A" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold" style={{ color: '#003E52' }}>{progressLabel}</p>
            <p className="text-sm mt-1" style={{ color: '#6B7280' }}>This may take 20–60 seconds</p>
          </div>
          <div className="rounded-full overflow-hidden" style={{ height: '8px', background: '#E5E7EB' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: '#C8A45A' }}
            />
          </div>
          <p className="text-xs" style={{ color: '#6B7280' }}>{progress}%</p>
        </div>
      </div>
    );
  }

  // ── Phase: Scored Articles ──────────────────────────────────────
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
        <div className="flex items-center gap-3">
          <label className="text-xs" style={{ color: '#6B7280' }}>Sort by</label>
          <select
            value={sortField}
            onChange={e => setSortField(e.target.value as SortField)}
            className="border rounded px-3 py-1.5 text-sm"
            style={{ borderColor: '#E5E7EB', color: '#003E52' }}
          >
            <option value="scoreTier">Score Tier</option>
            <option value="publishDate">Publish Date</option>
          </select>
          <button className="btn-secondary text-sm"
            onClick={() => { setPhase('upload'); setFile(null); setArticles([]); setValidationNote(null); }}>
            New Upload
          </button>
        </div>
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
