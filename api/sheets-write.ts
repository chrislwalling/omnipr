import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendToSheet } from '../lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { tab, rows } = req.body;
    if (!tab || !rows) return res.status(400).json({ error: 'tab and rows are required' });
    await appendToSheet(tab, rows);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
