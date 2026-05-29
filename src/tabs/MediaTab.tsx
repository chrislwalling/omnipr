import { useState, useEffect, useCallback } from 'react';
import type { MediaContact, PitchContext, SavedPitch } from '../types';

interface Props {
  onWritePitch: (ctx: PitchContext) => void;
}

export default function MediaTab({ onWritePitch }: Props) {
  const [contacts, setContacts] = useState<MediaContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<number | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const [mediaRes, pitchRes] = await Promise.all([
        fetch('/api/sheets-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tab: 'Media List', asObjects: true }),
        }),
        fetch('/api/sheets-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tab: 'Pitch Tracker', asObjects: true }),
        }),
      ]);

      const mediaData = await mediaRes.json();
      const pitchData = await pitchRes.json();

      const pitches: SavedPitch[] = (pitchData.rows || []).map(
        (r: Record<string, string>, i: number) => ({
          journalistFirst: r['Journalist First'] || '',
          journalistLast: r['Journalist Last'] || '',
          outlet: r['Outlet'] || '',
          omniProperty: r['Omni Property'] || '',
          subjectLine: r['Subject Line'] || '',
          body: r['Body'] || '',
          dateSaved: r['Date Saved'] || '',
          status: r['Status'] || 'Draft',
          rowIndex: i + 2,
        })
      );

      const rows: MediaContact[] = (mediaData.rows || []).map(
        (r: Record<string, string>, i: number) => {
          const firstName = r['First'] || '';
          const lastName = r['Last'] || '';
          const journalistPitches = pitches.filter(
            p => p.journalistFirst === firstName && p.journalistLast === lastName
          );
          const lastPitched = journalistPitches
            .map(p => p.dateSaved)
            .filter(d => d)
            .sort()
            .reverse()[0] || '';

          return {
            outlet: r['Outlet'] || '',
            first: firstName,
            last: lastName,
            contact: r['Contact'] || '',
            newContact: r['New Contact'] || '',
            sourceArticleUrl: r['Source Article URL'] || '',
            competitorPropertyCovered: r['Competitor Property Covered'] || '',
            pitchAngle: r['Pitch Angle'] || '',
            lastPitched,
            rowIndex: i + 2,
          };
        }
      );
      setContacts(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `${c.first} ${c.last}`.toLowerCase().includes(q) ||
      c.outlet.toLowerCase().includes(q) ||
      c.contact.toLowerCase().includes(q)
    );
  });

  async function handleFieldChange(idx: number, field: keyof MediaContact, value: string) {
    const updated = contacts.map((c, i) => i === idx ? { ...c, [field]: value } : c);
    setContacts(updated);
  }

  async function handleBlur(contact: MediaContact, idx: number) {
    if (!contact.rowIndex) return;
    setSaving(idx);
    try {
      await fetch('/api/sheets-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: 'Media List',
          rowIndex: contact.rowIndex,
          values: [
            contact.outlet,
            contact.first,
            contact.last,
            contact.contact,
            contact.newContact,
            contact.sourceArticleUrl,
            contact.competitorPropertyCovered,
            contact.pitchAngle,
            contact.lastPitched,
          ],
        }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  }

  async function toggleNewContact(contact: MediaContact, idx: number) {
    const updated = { ...contact, newContact: contact.newContact === 'Yes' ? 'No' : 'Yes' };
    const allUpdated = contacts.map((c, i) => i === idx ? updated : c);
    setContacts(allUpdated);
    await handleBlur(updated, idx);
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 style={{ color: '#003E52' }}>Media</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search name, outlet, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
            style={{ borderColor: '#E5E7EB', color: '#003E52', width: '240px' }}
          />
          <span className="text-sm" style={{ color: '#6B7280' }}>
            {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ backgroundColor: '#E5E7EB' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Users2 />
          <p className="text-sm" style={{ color: '#6B7280' }}>
            {search ? 'No contacts match your search.' : 'No contacts yet. Add contacts from article cards in the News tab.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E5E7EB' }}>
          <table className="dash-table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Outlet</th>
                <th>Contact Email</th>
                <th>New Contact</th>
                <th>Competitor Covered</th>
                <th>Pitch Angle</th>
                <th>Source Article</th>
                <th>Last Pitched</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact, displayIdx) => {
                const realIdx = contacts.indexOf(contact);
                return (
                  <tr key={realIdx}>
                    <td>
                      <div className="flex gap-1">
                        <input
                          className="border-b text-sm w-16 bg-transparent outline-none focus:border-gold"
                          style={{ borderColor: '#E5E7EB', color: '#003E52' }}
                          value={contact.first}
                          onChange={e => handleFieldChange(realIdx, 'first', e.target.value)}
                          onBlur={() => handleBlur(contact, realIdx)}
                          placeholder="First"
                        />
                        <input
                          className="border-b text-sm w-20 bg-transparent outline-none focus:border-gold"
                          style={{ borderColor: '#E5E7EB', color: '#003E52' }}
                          value={contact.last}
                          onChange={e => handleFieldChange(realIdx, 'last', e.target.value)}
                          onBlur={() => handleBlur(contact, realIdx)}
                          placeholder="Last"
                        />
                      </div>
                    </td>
                    <td>
                      <input
                        className="border-b text-sm w-32 bg-transparent outline-none"
                        style={{ borderColor: '#E5E7EB', color: '#003E52' }}
                        value={contact.outlet}
                        onChange={e => handleFieldChange(realIdx, 'outlet', e.target.value)}
                        onBlur={() => handleBlur(contact, realIdx)}
                      />
                    </td>
                    <td>
                      <input
                        className="border-b text-sm w-44 bg-transparent outline-none"
                        style={{ borderColor: '#E5E7EB', color: '#003E52' }}
                        value={contact.contact}
                        onChange={e => handleFieldChange(realIdx, 'contact', e.target.value)}
                        onBlur={() => handleBlur(contact, realIdx)}
                        placeholder="email"
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => toggleNewContact(contact, realIdx)}
                        className="text-xs px-2 py-0.5 rounded-full font-semibold transition-colors"
                        style={{
                          backgroundColor: contact.newContact === 'Yes' ? '#dbeafe' : '#f3f4f6',
                          color: contact.newContact === 'Yes' ? '#1d4ed8' : '#6b7280',
                        }}
                      >
                        {contact.newContact === 'Yes' ? 'New Contact' : 'No'}
                      </button>
                    </td>
                    <td className="text-sm" style={{ color: '#475569' }}>
                      {contact.competitorPropertyCovered || <span style={{ color: '#C9C9C9' }}>—</span>}
                    </td>
                    <td className="text-sm max-w-xs" style={{ color: '#475569' }}>
                      <span title={contact.pitchAngle}>
                        {contact.pitchAngle.length > 50
                          ? contact.pitchAngle.slice(0, 50) + '…'
                          : contact.pitchAngle || <span style={{ color: '#C9C9C9' }}>—</span>}
                      </span>
                    </td>
                    <td>
                      {contact.sourceArticleUrl ? (
                        <a
                          href={contact.sourceArticleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs underline"
                          style={{ color: '#C8A45A' }}
                        >
                          View article
                        </a>
                      ) : <span style={{ color: '#C9C9C9' }}>—</span>}
                    </td>
                    <td className="text-xs" style={{ color: '#6B7280' }}>
                      {contact.lastPitched || <span style={{ color: '#C9C9C9' }}>—</span>}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="text-xs px-3 py-1 rounded font-semibold transition-colors"
                          style={{ backgroundColor: '#C8A45A', color: '#003E52' }}
                          onClick={() => onWritePitch({
                            journalistName: `${contact.first} ${contact.last}`.trim(),
                            outlet: contact.outlet,
                            competitorProperty: contact.competitorPropertyCovered,
                            articleHeadline: '',
                            articleUrl: contact.sourceArticleUrl,
                            pitchAngle: contact.pitchAngle,
                          })}
                        >
                          Write Pitch
                        </button>
                        {saving === realIdx && (
                          <span className="text-xs" style={{ color: '#6B7280' }}>Saving...</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Users2() {
  return (
    <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#6B7280" strokeWidth={1.2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
