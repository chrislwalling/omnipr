import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, Copy } from 'lucide-react';
import type { PitchContext } from '../types';

const PRIORITY_PROPERTIES = [
  'PGA Frisco',
  'La Costa',
  'Amelia Island',
  'Barton Creek',
  'Homestead',
];

const OTHER_PROPERTIES = [
  'Omni Mount Washington',
  'Omni Tucson National',
  'Omni Interlocken',
  'Omni Grove Park Inn',
  'Omni Scottsdale',
  'Omni Hilton Head',
  'Omni Championsgate',
];

type Step = 'form' | 'generating' | 'result';

interface Props {
  initialContext: PitchContext | null;
}

export default function PitchesTab({ initialContext }: Props) {
  const [step, setStep] = useState<Step>('form');

  const [journalistName, setJournalistName] = useState(initialContext?.journalistName || '');
  const [outlet, setOutlet] = useState(initialContext?.outlet || '');
  const [competitorProperty, setCompetitorProperty] = useState(initialContext?.competitorProperty || '');
  const [articleHeadline, setArticleHeadline] = useState(initialContext?.articleHeadline || '');
  const [pitchAngle, setPitchAngle] = useState(initialContext?.pitchAngle || '');

  const [selectedProperty, setSelectedProperty] = useState('');

  const [subjectLine, setSubjectLine] = useState('');
  const [body, setBody] = useState('');
  const [feedback, setFeedback] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialContext) {
      setJournalistName(initialContext.journalistName || '');
      setOutlet(initialContext.outlet || '');
      setCompetitorProperty(initialContext.competitorProperty || '');
      setArticleHeadline(initialContext.articleHeadline || '');
      setPitchAngle(initialContext.pitchAngle || '');
      setStep('form');
      setSaved(false);
      setSubjectLine('');
      setBody('');
      setFeedback('');
    }
  }, [initialContext]);

  async function handleGenerate(withFeedback = false) {
    if (!selectedProperty) return;
    setGenerating(true);
    setError(null);
    if (!withFeedback) setStep('generating');
    try {
      const res = await fetch('/api/draft-pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journalistName,
          outlet,
          competitorProperty,
          articleHeadline,
          pitchAngle,
          omniProperty: selectedProperty,
          feedback: withFeedback ? feedback : undefined,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Generation failed (${res.status})`);
      }
      const data = await res.json();
      setSubjectLine(data.subjectLine || '');
      setBody(data.body || '');
      setFeedback('');
      setSaved(false);
      setStep('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
      if (!withFeedback) setStep('form');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const nameParts = journalistName.trim().split(' ');
      await fetch('/api/sheets-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: 'Pitch Tracker',
          rows: [[
            nameParts[0] || '',
            nameParts.slice(1).join(' ') || '',
            outlet,
            selectedProperty,
            subjectLine,
            body,
            new Date().toISOString().split('T')[0],
            'Draft',
          ]],
        }),
      });
      // Increment My Metrics (non-blocking)
      fetch('/api/metrics-increment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitchesDrafted: 1 }),
      }).catch(() => {});
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(`${subjectLine}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Generating ─────────────────────────────────────────────────────
  if (step === 'generating') {
    return (
      <div className="p-8 flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="text-center space-y-4">
          <Loader2 size={36} className="animate-spin mx-auto" style={{ color: '#C8A45A' }} />
          <p className="font-medium" style={{ color: '#003E52', fontFamily: 'Georgia, serif' }}>Writing pitch...</p>
          <p className="text-sm" style={{ color: '#6B7280' }}>Claude is generating a targeted pitch for {selectedProperty}</p>
        </div>
      </div>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────
  if (step === 'result') {
    return (
      <div className="p-8">
        <div className="max-w-3xl space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 style={{ color: '#003E52', marginBottom: '0.25rem' }}>Pitch Draft</h2>
              <p className="text-sm" style={{ color: '#6B7280' }}>
                For {journalistName || 'journalist'}{outlet ? ` at ${outlet}` : ''} — {selectedProperty}
              </p>
            </div>
            <button className="btn-secondary text-sm" onClick={() => setStep('form')}>← Edit</button>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#6B7280' }}>SUBJECT LINE</label>
            <input
              type="text"
              value={subjectLine}
              onChange={e => setSubjectLine(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 text-sm font-medium"
              style={{ borderColor: '#E5E7EB', color: '#003E52' }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#6B7280' }}>PITCH BODY</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              className="w-full rounded-lg border p-4 text-sm leading-relaxed"
              style={{ borderColor: '#E5E7EB', minHeight: '300px', color: '#003E52', resize: 'vertical' }}
            />
            <div className="flex justify-end mt-2">
              <button className="btn-secondary flex items-center gap-1.5 text-sm" onClick={handleCopy}>
                <Copy size={14} />{copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div
            className="rounded-xl p-5 space-y-3"
            style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#003E52' }}>Refine this pitch</p>
            <input
              type="text"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="e.g. Make it shorter, lead with the renovation, reference NCAA hosting..."
              className="w-full border rounded-lg px-4 py-2 text-sm"
              style={{ borderColor: '#E5E7EB', color: '#003E52' }}
            />
            <button
              className="btn-secondary flex items-center gap-2 text-sm"
              disabled={!feedback.trim() || generating}
              onClick={() => handleGenerate(true)}
            >
              {generating && <Loader2 size={14} className="animate-spin" />}
              {generating ? 'Regenerating...' : 'Regenerate'}
            </button>
          </div>

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>{error}</div>
          )}

          {!saved ? (
            <div
              className="rounded-xl p-4 flex items-center justify-between"
              style={{ backgroundColor: '#fff', border: '1.5px solid #E5E7EB' }}
            >
              <p className="text-sm" style={{ color: '#003E52' }}>Save this pitch to Pitch Tracker</p>
              <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Saving...' : 'Save Pitch'}
              </button>
            </div>
          ) : (
            <div
              className="rounded-xl p-4 flex items-center gap-2"
              style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0' }}
            >
              <CheckCircle size={16} style={{ color: '#16a34a' }} />
              <p className="text-sm" style={{ color: '#15803d' }}>Saved to Pitch Tracker as Draft.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      <h2 style={{ color: '#003E52', marginBottom: '1.5rem' }}>Write a Pitch</h2>
      <div className="max-w-xl space-y-6">

        <section
          className="rounded-xl p-5 space-y-4"
          style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#C8A45A' }}>Step 1 — Journalist Context</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#003E52' }}>Journalist Name</label>
              <input
                type="text"
                value={journalistName}
                onChange={e => setJournalistName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                style={{ borderColor: '#E5E7EB', color: '#003E52' }}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#003E52' }}>Outlet</label>
              <input
                type="text"
                value={outlet}
                onChange={e => setOutlet(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                style={{ borderColor: '#E5E7EB', color: '#003E52' }}
                placeholder="e.g. Golf Digest"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#003E52' }}>Competitor Property They Covered</label>
            <input
              type="text"
              value={competitorProperty}
              onChange={e => setCompetitorProperty(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: '#E5E7EB', color: '#003E52' }}
              placeholder="e.g. Pinehurst, Pebble Beach"
            />
          </div>
          {articleHeadline && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#6B7280' }}>Source Article</label>
              <p className="text-sm" style={{ color: '#475569' }}>{articleHeadline}</p>
            </div>
          )}
          {pitchAngle && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#6B7280' }}>Suggested Angle</label>
              <p className="text-sm" style={{ color: '#475569' }}>{pitchAngle}</p>
            </div>
          )}
        </section>

        <section
          className="rounded-xl p-5 space-y-4"
          style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#C8A45A' }}>Step 2 — Select Omni Property</p>
          <p className="text-xs" style={{ color: '#6B7280' }}>12 properties in the Omni Golf Collection. Priority properties listed first.</p>
          <select
            value={selectedProperty}
            onChange={e => setSelectedProperty(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            style={{ borderColor: selectedProperty ? '#C8A45A' : '#E5E7EB', color: '#003E52' }}
          >
            <option value="">Select a property...</option>
            <optgroup label="★ Priority Properties">
              {PRIORITY_PROPERTIES.map(p => <option key={p} value={p}>{p}</option>)}
            </optgroup>
            <optgroup label="Other Properties">
              {OTHER_PROPERTIES.map(p => <option key={p} value={p}>{p}</option>)}
            </optgroup>
          </select>
        </section>

        {error && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>{error}</div>
        )}

        <button
          className="btn-primary w-full flex items-center justify-center gap-2"
          disabled={!selectedProperty || generating}
          onClick={() => handleGenerate(false)}
        >
          {generating && <Loader2 size={16} className="animate-spin" />}
          {generating ? 'Generating...' : 'Generate Pitch'}
        </button>
      </div>
    </div>
  );
}
