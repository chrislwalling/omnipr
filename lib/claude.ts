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

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: OMNI_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: contextString
            ? `Context:\n${contextString}\n\n${userPrompt}`
            : userPrompt,
        },
      ],
    });

    let content = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      }
    }

    if (!content || content.length === 0) {
      throw new Error(`Claude returned empty content. Response has ${response.content.length} blocks`);
    }

    return { content };
  } catch (error) {
    console.error('Claude API error:', error);
    throw error;
  }
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}
