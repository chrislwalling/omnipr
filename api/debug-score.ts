import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callClaude } from '../lib/claude.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const testArticles = [
      {
        headline: 'Test Article',
        outlet: 'Golf Digest',
        author: 'Test Author',
        uvm: 500000,
        url: 'https://example.com',
        publishDate: '2025-01-15',
      },
    ];

    const userPrompt = `Score this 1 article. Return ONLY a JSON array with exactly 1 object. Each object must have these fields: index (number), headline (string), url (string), outlet (string), author (string), publishDate (string), uvm (string), scoreTier (string: "High" | "Medium" | "Low" | "Discard"), articleType (string), competitorProperty (string), scoringExplanation (string), pitchAngle (string), syndicationCount (number), isCanonical (boolean).

Article:
1. Headline: "Test Article" | Outlet: Golf Digest | Author: Test Author | UVM: 500000 | URL: https://example.com | Date: 2025-01-15

Return ONLY the JSON array, nothing else.`;

    const result = await callClaude({
      userPrompt,
      contextString: 'You are a golf media scoring AI. Score this test article.',
    });

    return res.json({
      success: true,
      responseLength: result.content.length,
      firstChars: result.content.slice(0, 500),
      fullResponse: result.content,
      contentType: typeof result.content,
    });
  } catch (e) {
    return res.status(500).json({
      error: (e as Error).message,
      stack: (e as Error).stack,
    });
  }
}
