import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateSheetRow } from '../lib/sheets';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { tab, rowIndex, values } = req.body;
    if (!tab || !rowIndex || !values) return res.status(400).json({ error: 'tab, rowIndex, values required' });
    await updateSheetRow(tab, rowIndex, values);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
