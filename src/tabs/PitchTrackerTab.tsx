import { useState, useEffect, useCallback } from 'react';
import StatusBadge from '../components/StatusBadge';
import type { SavedPitch, PitchStatus } from '../types';

const STATUS_OPTIONS: PitchStatus[] = ['Draft', 'Sent', 'Followed Up', 'Responded', 'Closed'];

export default function PitchTrackerTab() {
  const [pitches, setPitches] = useState<SavedPitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<'dateSaved' | 'status'>('dateSaved');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [updatingRow, setUpdatingRow] = useState<number | null>(null);

  const loadPitches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sheets-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: 'Pitch Tracker', asObjects: true }),
      });
      const data = await res.json();
      const rows: SavedPitch[] = (data.rows || []).map(
        (r: Record<string, string>, i: number) => ({
          journalistFirst: r['Journalist First'] || '',
          journalistLast: r['Journalist Last'] || '',
          outlet: r['Outlet'] || '',
          omniProperty: r['Omni Property'] || '',
          subjectLine: r['Subject Line'] || '',
          body: r['Body'] || '',
          dateSaved: r['Date Saved'] || '',
          status: r['Status'] || 'Draft',
          rowIndex: i + 2, // 1-based header offset
        })
      );
      setPitches(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPitches(); }, [loadPitches]);

  const filtered = pitches
    .filter(p => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !`${p.journalistFirst} ${p.journalistLast}`.toLowerCase().includes(q) &&
          !p.outlet.toLowerCase().includes(q) &&
          !p.omniProperty.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortField === 'dateSaved') return (b.dateSaved || '').localeCompare(a.dateSaved || '');
      return (a.status || '').localeCompare(b.status || '');
    });

  async function handleStatusChange(pitch: SavedPitch, newStatus: PitchStatus) {
    const realIdx = pitches.indexOf(pitch);
    const updated = { ...pitch, status: newStatus };
    setPitches(prev => prev.map((p, i) => i === realIdx ? updated : p));

    if (!pitch.rowIndex) return;
    setUpdatingRow(pitch.rowIndex);
    try {
      await fetch('/api/sheets-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: 'Pitch Tracker',
          rowIndex: pitch.rowIndex,
          values: [
            updated.journalistFirst,
            updated.journalistLast,
            updated.outlet,
            updated.omniProperty,
            updated.subjectLine,
            updated.body,
            updated.dateSaved,
            updated.status,
          ],
        }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingRow(null);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 style={{ color: '#1B2F52' }}>Pitch Tracker</h2>
        <button className="btn-secondary text-sm" onClick={loadPitches}>Refresh</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search journalist, outlet, property…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
          style={{ borderColor: '#E8E0D4', color: '#1B2F52', minWidth: '220px' }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
          style={{ borderColor: '#E8E0D4', color: '#1B2F52' }}
        >
          <option value="All">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={sortField}
          onChange={e => setSortField(e.target.value as 'dateSaved' | 'status')}
          className="border rounded px-3 py-1.5 text-sm"
          style={{ borderColor: '#E8E0D4', color: '#1B2F52' }}
        >
          <option value="dateSaved">Sort by Date</option>
          <option value="status">Sort by Status</option>
        </select>
        <span className="text-sm self-center" style={{ color: '#8A9BB0' }}>
          {filtered.length} pitch{filtered.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: '#E8E0D4' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#8A9BB0" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
          <p className="text-sm" style={{ color: '#8A9BB0' }}>
            {search || statusFilter !== 'All' ? 'No pitches match your filters.' : 'No saved pitches yet. Generate pitches in the Pitches tab.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E8E0D4' }}>
          <table className="dash-table w-full">
            <thead>
              <tr>
                <th>Journalist</th>
                <th>Outlet</th>
                <th>Property</th>
                <th>Subject Line</th>
                <th>Date Saved</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((pitch, idx) => (
                <tr key={idx}>
                  <td className="font-medium" style={{ color: '#1B2F52' }}>
                    {`${pitch.journalistFirst} ${pitch.journalistLast}`.trim() || <span style={{ color: '#8A9BB0' }}>—</span>}
                  </td>
                  <td>{pitch.outlet || <span style={{ color: '#8A9BB0' }}>—</span>}</td>
                  <td>
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{ backgroundColor: 'rgba(201,168,76,0.1)', color: '#1B2F52' }}
                    >
                      {pitch.omniProperty}
                    </span>
                  </td>
                  <td className="max-w-xs" style={{ maxWidth: '260px' }}>
                    <span
                      className="text-sm block truncate"
                      title={pitch.subjectLine}
                      style={{ color: '#1B2F52' }}
                    >
                      {pitch.subjectLine || <span style={{ color: '#8A9BB0' }}>(no subject)</span>}
                    </span>
                  </td>
                  <td className="text-sm" style={{ color: '#8A9BB0' }}>
                    {pitch.dateSaved || <span style={{ color: '#C9C9C9' }}>—</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <select
                        value={pitch.status}
                        onChange={e => handleStatusChange(pitch, e.target.value as PitchStatus)}
                        className="border rounded px-2 py-1 text-xs"
                        style={{ borderColor: '#E8E0D4', color: '#1B2F52' }}
                        disabled={updatingRow === pitch.rowIndex}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <StatusBadge status={pitch.status} />
                      {updatingRow === pitch.rowIndex && (
                        <span className="text-xs" style={{ color: '#8A9BB0' }}>Saving...</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
