import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callClaude } from '../lib/claude.js';

const PROPERTIES: Record<string, string> = {
  'Omni PGA Frisco': 'Home of the PGA of America headquarters campus. Two championship courses: Fields Ranch East and West. Pair with Omni Barton Creek for Texas regional pitches. Newest major golf destination in America.',
  'Omni La Costa': 'Gil Hanse-redesigned North Course (2023). Hosting NCAA Division I Championships through 2028. Legacy destination in Carlsbad, CA — 50+ years of golf history.',
  'Omni Amelia Island': '$7.4M Oak Marsh renovation by Beau Welling Design completed May 2025. Oceanfront destination in Florida. Three distinct courses.',
  'Omni Barton Creek': 'Austin, TX golf destination. Pair with Omni PGA Frisco for Texas regional pitches. Fazio-designed courses.',
  'Omni Homestead': '$150M+ renovation completed fall 2023. Historic Hot Springs, VA resort. Cascades Course ranked among America\'s top 50. Oldest continually operating resort in America.',
  'Omni Mount Washington': 'Bretton Woods, NH. Valid for combined golf and ski pitches. Historic White Mountains setting.',
  'Omni Tucson National': 'Tucson, AZ. Host of PGA Tour events. Desert course with Sonoran mountain views.',
  'Omni Interlocken': 'Broomfield, CO. 27-hole championship layout in the Rocky Mountain foothills.',
  'Omni Grove Park Inn': 'Asheville, NC. Historic Blue Ridge Mountain resort. Donald Ross-designed course.',
  'Omni Scottsdale': 'Scottsdale, AZ. Desert golf at The Boulders. Two championship courses.',
  'Omni Hilton Head': 'Hilton Head, SC. Oceanfront resort with Sea Pines-adjacent golf.',
  'Omni Championsgate': 'Orlando, FL. Rees Jones-designed International and National courses.',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { journalistName, outlet, competitorProperty, articleHeadline, pitchAngle, omniProperty, feedback } = req.body;
    if (!journalistName || !omniProperty) return res.status(400).json({ error: 'journalistName and omniProperty required' });

    const propertyProofPoints = PROPERTIES[omniProperty] || `${omniProperty} — Omni Golf Collection property.`;

    const userPrompt = feedback
      ? `The user provided this feedback on a previous draft: "${feedback}"\n\nRewrite the pitch incorporating this feedback. Replace the draft entirely — do not append or show a diff.\n\nOriginal context: Journalist ${journalistName}${outlet ? ` at ${outlet}` : ''}. They covered: ${competitorProperty || 'a competitor golf resort'}. Pitching: ${omniProperty}.\n\nProperty proof points: ${propertyProofPoints}\n\nOutput as JSON with two fields:\n- subjectLine: the email subject (punchy, under 10 words)\n- body: full pitch body (3 paragraphs, under 250 words, professional but conversational)`
      : `Write a PR pitch to ${journalistName}${outlet ? ` at ${outlet}` : ''}.\n\nContext:\n- They recently covered: ${competitorProperty || 'a competitor golf resort'}${articleHeadline ? ` ("${articleHeadline}")` : ''}\n- Suggested angle: ${pitchAngle || 'golf resort travel'}\n- Property to pitch: ${omniProperty}\n\nProperty proof points: ${propertyProofPoints}\n\nBrand voice guidelines:\n- Quiet luxury distinction: Omni is not stuffy, but it is not mass-market\n- Multi-generational framing preferred over Gen Z targeting\n- Lead with the specific renovation/course/differentiator, not generic resort language\n- If pitching Texas properties, pair Omni PGA Frisco + Omni Barton Creek as a regional two-property story\n\nOutput as JSON with two fields:\n- subjectLine: the email subject (punchy, under 10 words)\n- body: full pitch body (3 paragraphs, under 250 words, professional but conversational)`;

    const result = await callClaude({ userPrompt, contextString: '' });

    let subjectLine = '';
    let body = '';
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        subjectLine = parsed.subjectLine || '';
        body = parsed.body || '';
      } else {
        body = result.content;
      }
    } catch {
      body = result.content;
    }

    return res.json({ subjectLine, body });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
