import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const OMNI_SYSTEM_PROMPT = `You are an AI PR strategist embedded with the Omni Hotels & Resorts PR team.
You analyze golf and travel media coverage to identify pitch opportunities for the Omni Golf Collection (12 properties).

Brand voice: Quiet luxury. Multi-generational. Not Gen Z primary. Premium but approachable.
Key distinction: Omni is not a golf brand that also does hotels — it is a luxury hotel brand with world-class golf.

When generating pitches, always use specific proof points. Never write generic resort language.
Cite course architects, renovation details, rankings, and property-specific differentiators.`;

export interface ClaudeCallOptions {
  userPrompt: string;
  contextString: string;
}

export interface ClaudeResult {
  content: string;
}

export async function callClaude(options: ClaudeCallOptions): Promise<ClaudeResult> {
  const { userPrompt, contextString } = options;

  const messages = contextString
    ? [{ role: 'user' as const, content: `Context:\n${contextString}\n\n${userPrompt}` }]
    : [{ role: 'user' as const, content: userPrompt }];

  let attempts = 0;
  const maxAttempts = 4;

  while (true) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 64000,
        system: OMNI_SYSTEM_PROMPT,
        messages,
      });

      let content = '';
      if (response.content && Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block && block.type === 'text' && 'text' in block) {
            content += (block as { type: 'text'; text: string }).text;
          }
        }
      }

      if (!content || content.length === 0) {
        throw new Error(`Claude returned empty or no text content. Response: ${JSON.stringify(response)}`);
      }

      return { content };
    } catch (error) {
      const isRateLimit = error instanceof Anthropic.APIError && error.status === 429;
      if (isRateLimit && attempts < maxAttempts) {
        attempts++;
        const wait = Math.pow(2, attempts) * 5000; // 10s, 20s, 40s, 80s
        console.warn(`[Claude] Rate limited (attempt ${attempts}/${maxAttempts}), retrying in ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.error('=== CLAUDE API ERROR ===');
      console.error('Error:', error);
      console.error('=== END CLAUDE API ERROR ===');
      throw error;
    }
  }
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}
