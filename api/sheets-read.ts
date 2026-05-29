import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSheet, readSheetAsObjects } from '../lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { tab, range, asObjects } = req.body;
    if (!tab) return res.status(400).json({ error: 'tab is required' });
    if (asObjects) {
      const rows = await readSheetAsObjects(tab);
      return res.json({ rows });
    }
    const rows = await readSheet(tab, range);
    return res.json({ rows });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
