import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSheetAsObjects, appendToSheet, updateSheetRow } from '../lib/sheets.js';

interface MetricsPayload {
  articlesScored?: number;
  newContactsAdded?: number;
  pitchesDrafted?: number;
  opportunitiesConverted?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body: MetricsPayload = req.body || {};
  const today = new Date().toISOString().split('T')[0];
  try {
    const rows = await readSheetAsObjects('My Metrics');
    const todayIdx = rows.findIndex(r => r['Date'] === today);
    if (todayIdx >= 0) {
      const e = rows[todayIdx];
      await updateSheetRow('My Metrics', todayIdx + 2, [
        today,
        String((parseInt(e['Articles Scored'] || '0') || 0) + (body.articlesScored || 0)),
        String((parseInt(e['New Contacts Added'] || '0') || 0) + (body.newContactsAdded || 0)),
        String((parseInt(e['Pitches Drafted'] || '0') || 0) + (body.pitchesDrafted || 0)),
        String((parseInt(e['Opportunities Converted'] || '0') || 0) + (body.opportunitiesConverted || 0)),
      ]);
    } else {
      await appendToSheet('My Metrics', [[
        today,
        String(body.articlesScored || 0),
        String(body.newContactsAdded || 0),
        String(body.pitchesDrafted || 0),
        String(body.opportunitiesConverted || 0),
      ]]);
    }
    return res.json({ ok: true });
  } catch (e) {
    // Silently fail if "My Metrics" sheet doesn't exist; it's optional
    const msg = (e as Error).message;
    if (msg.includes('not found') || msg.includes('INVALID_ARGUMENT')) {
      return res.json({ ok: true, note: 'My Metrics sheet not found (optional)' });
    }
    return res.status(500).json({ error: msg });
  }
}
