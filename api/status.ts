import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { getSheetsClient } from '../lib/sheets';

async function checkGoogleSheets() {
  try {
    const credentialsB64 = process.env.GOOGLE_SHEETS_CREDENTIALS;
    if (!credentialsB64) return { configured: false, reachable: false, error: 'GOOGLE_SHEETS_CREDENTIALS not set' };
    const sheetId = process.env.OMNI_SHEET_ID;
    if (!sheetId) return { configured: false, reachable: false, error: 'OMNI_SHEET_ID not set' };
    const sheets = getSheetsClient();
    await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets' });
    return { configured: true, reachable: true, error: null };
  } catch (e) {
    return { configured: true, reachable: false, error: (e as Error).message };
  }
}

async function checkClaude() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { configured: false, reachable: false, error: 'ANTHROPIC_API_KEY not set' };
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return { configured: true, reachable: true, error: null };
  } catch (e) {
    return { configured: true, reachable: false, error: (e as Error).message };
  }
}

async function checkSlack() {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { configured: false, reachable: false, error: 'SLACK_WEBHOOK_URL not set' };
  return { configured: true, reachable: true, error: null };
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const [googleSheets, claude, slack] = await Promise.all([
    checkGoogleSheets(),
    checkClaude(),
    checkSlack(),
  ]);
  res.json({ googleSheets, claude, slack });
}
