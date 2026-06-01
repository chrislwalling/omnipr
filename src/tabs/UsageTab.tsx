import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface DayMetrics {
  date: string;
  articlesScored: number;
  newContactsAdded: number;
  pitchesDrafted: number;
  opportunitiesConverted: number;
}

interface KpiTile {
  label: string;
  value: number;
  accent: boolean;
}

export default function UsageTab() {
  const [rows, setRows] = useState<DayMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/sheets-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tab: 'My Metrics', asObjects: true }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const parsed: DayMetrics[] = (data.rows || []).map((r: Record<string, string>) => ({
          date: r['Date'] || '',
          articlesScored: parseInt(r['Articles Scored'] || '0') || 0,
          newContactsAdded: parseInt(r['New Contacts Added'] || '0') || 0,
          pitchesDrafted: parseInt(r['Pitches Drafted'] || '0') || 0,
          opportunitiesConverted: parseInt(r['Opportunities Converted'] || '0') || 0,
        }));
        const sorted = parsed
          .filter(r => r.date)
          .sort((a, b) => a.date.localeCompare(b.date));
        setRows(sorted);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load metrics');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totals = rows.reduce(
    (acc, r) => ({
      articlesScored: acc.articlesScored + r.articlesScored,
      newContactsAdded: acc.newContactsAdded + r.newContactsAdded,
      pitchesDrafted: acc.pitchesDrafted + r.pitchesDrafted,
      opportunitiesConverted: acc.opportunitiesConverted + r.opportunitiesConverted,
    }),
    { articlesScored: 0, newContactsAdded: 0, pitchesDrafted: 0, opportunitiesConverted: 0 }
  );

  const kpis: KpiTile[] = [
    { label: 'Articles Scored', value: totals.articlesScored, accent: false },
    { label: 'Contacts Added', value: totals.newContactsAdded, accent: true },
    { label: 'Pitches Drafted', value: totals.pitchesDrafted, accent: false },
    { label: 'Opportunities Converted', value: totals.opportunitiesConverted, accent: true },
  ];

  // Keep last 84 days for chart display
  const chartData = rows.slice(-84).map(r => ({
    date: r.date.slice(5),
    'Articles Scored': r.articlesScored,
    'Contacts Added': r.newContactsAdded,
    'Pitches Drafted': r.pitchesDrafted,
    'Converted': r.opportunitiesConverted,
  }));

  return (
    <div className="p-8">
      <h2 style={{ color: '#1B2F52', marginBottom: '1.5rem' }}>Usage</h2>

      {/* KPI tiles */}
      <div
        className="grid gap-4 mb-8"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
      >
        {kpis.map(kpi => (
          <div
            key={kpi.label}
            className="rounded-xl p-5"
            style={{ backgroundColor: '#fff', border: '1px solid #E8E0D4' }}
          >
            <p
              className="text-xs font-semibold tracking-widest uppercase mb-2"
              style={{ color: '#8A9BB0' }}
            >
              {kpi.label}
            </p>
            <p
              className="text-4xl font-bold"
              style={{
                color: error ? '#991b1b' : kpi.accent ? '#C9A84C' : '#1B2F52',
                fontFamily: 'Georgia, serif',
              }}
            >
              {loading ? '—' : error ? '!' : kpi.value.toLocaleString()}
            </p>
            <p className="text-xs mt-1" style={{ color: error ? '#991b1b' : '#8A9BB0' }}>
              {error ? 'Error' : 'All time'}
            </p>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: '#fff', border: '1px solid #E8E0D4' }}
      >
        <p className="text-sm font-semibold mb-4" style={{ color: '#1B2F52' }}>
          12-Week Activity Trend
        </p>
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }}
            />
          </div>
        ) : error ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-2">
            <p className="text-sm" style={{ color: '#8A9BB0' }}>
              No activity yet. Start scoring articles and drafting pitches to see trends here.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D4" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8A9BB0' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8A9BB0' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  borderColor: '#E8E0D4',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone" dataKey="Articles Scored"
                stroke="#1B2F52" strokeWidth={2} dot={false}
              />
              <Line
                type="monotone" dataKey="Contacts Added"
                stroke="#C9A84C" strokeWidth={2} dot={false}
              />
              <Line
                type="monotone" dataKey="Pitches Drafted"
                stroke="#8A9BB0" strokeWidth={2} dot={false}
              />
              <Line
                type="monotone" dataKey="Converted"
                stroke="#16a34a" strokeWidth={2} dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
