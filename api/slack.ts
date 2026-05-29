import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return res.status(200).json({ ok: true, skipped: 'No webhook configured' });

  const { high = 0, medium = 0, low = 0, discarded = 0 } = req.body || {};
  const total = high + medium + low + discarded;

  const message = {
    text: `Hello Omni PR Team — *${total}* articles were scored from today's upload.\n• High Priority: *${high}*\n• Medium Priority: *${medium}*\n• Low Priority: *${low}*\n• Discarded: *${discarded}*\n\nView results in the Omni PR Dashboard.`,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!response.ok) return res.status(502).json({ error: 'Slack webhook error' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
