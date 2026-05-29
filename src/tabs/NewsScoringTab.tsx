import { useRef, useState, ChangeEvent, DragEvent } from 'react';
import type { ScoredArticle } from '../types';

type Phase = 'upload' | 'analyzing';

interface Props {
  onScoringComplete: (articles: ScoredArticle[], validationNote: string | null) => void;
}

export default function NewsScoringTab({ onScoringComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
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
      setProgress(90);

      // Fire Slack (non-blocking)
      fetch('/api/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(counts),
      }).catch(() => {});

      // Increment My Metrics (non-blocking)
      fetch('/api/metrics-increment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articlesScored: scored.length }),
      }).catch(() => {});

      setProgress(100);
      onScoringComplete(scored, note || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
      setPhase('upload');
      setProgress(0);
    }
  }

  // ── Phase: Upload ──────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div className="p-8">
        <h2 style={{ color: '#003E52', marginBottom: '1.5rem' }}>News Scoring</h2>
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
