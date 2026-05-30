import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callClaude, today } from '../lib/claude.js';
import { readSheetAsObjects, appendToSheet } from '../lib/sheets.js';
import type { ArticleInput, ScoredArticle } from '../src/types.js';

async function fetchArticleText(url: string, timeout = 10000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!response.ok) return null;
    const text = await response.text();
    // Extract text content, stripping basic HTML tags
    const stripped = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.slice(0, 3000);
  } catch {
    return null;
  }
}

const OMNI_SCORING_PROMPT = `You are scoring golf/travel media articles for PR value to Omni Hotels & Resorts.

GOVERNING TEST: Before scoring any article, ask: does this article help a PR team pitch an Omni golf resort to a travel or lifestyle journalist? If no, DISCARD immediately.

SCORING FORMULA: Score = Reach Score + Article Type Score + Outlet Tier Score

REACH SCORES:
- UVM 1M+ = 2
- UVM 250K–1M = 1
- UVM under 250K = 0

ARTICLE TYPE SCORES:
- Feature or Renovation = 2
- Championship or Rankings = 1
- Brief = 0
- Tee Times = Auto-discard

OUTLET TIER SCORES:
- Tier 1 (major national: NYT, WSJ, Golf Digest, Travel+Leisure, Condé Nast Traveler, etc.) = 2
- Tier 2 (golf/travel trade: GOLF Magazine, Golf World, Links, Robb Report, etc.) = 1
- Tier 3 (wire/aggregator) = 0
Note: Outside Magazine = T2 (max score 4). Micro-outlets under 5K UVM = Discard.

SCORE THRESHOLDS: HIGH = 5-6 | MEDIUM = 3-4 | LOW = 1-2 | DISCARD = 0
PROFILE BUMP: Any authored feature or profile = minimum score 3 regardless of reach.

DISCARD ALWAYS:
- Tournament/competition coverage, leaderboards, previews (unless about the destination)
- Tournament picks, betting, fantasy golf
- Player profiles and player qualification stories
- LIV Golf coverage (any angle)
- PGA Tour schedule/preview articles
- Press releases
- NCAA field announcements and results
- Puzzle or game coverage
- Non-golf sports
- Civic or local news unrelated to a destination
- Personal tragedy or healthcare coverage
- Celebrity real estate
- Political content
- Golf gossip
- Legal, financial, or litigation stories
- Substack newsletters
- Negative criticism unless about a competitor property
- Course stats in tournament context even from T1 outlets
LOCAL OUTLET FILTER: If local outlet AND Omni has no property there, Discard or Low.

GOLF-FORWARD PITCH FILTER:
- Golf listed as one item among spa/dining/hiking = flag pitch confidence as 'uncertain'
- Generic language like 'PGA-level course' = low golf fluency, downgrade pitch relevance
- Architect names, course design language, competitive golf context = strong pitch signal

SYNDICATION DEDUPLICATION: Group by normalized headline (first 60 chars) + author. Wire content with no author groups on headline alone. Canonical = highest UVM in cluster. Set syndicationCount on canonical.

COMPETITOR PROPERTIES TO WATCH:

Omni Golf Collection (All Properties) Competitors:
Streamsong, Destination Kohler, Pinehurst Resort, Cabot, Bandon Dunes, Kiawah Island Golf Resort

Omni PGA Frisco Specific Competitors:
Horseshoe Bay Resort, Lajitas Golf Resort, The Woodlands Resort, Streamsong Resort, Kiawah Island Golf Resort, Destination Kohler

Omni Barton Creek Specific Competitors:
Horseshoe Bay Resort, Tapatio Springs Hill Country Resort, La Cantera Resort, JW Marriott San Antonio Hill Country Resort & Spa, The Woodlands Resort, Lajitas Golf Resort

Omni La Costa Specific Competitors:
The Resort at Pelican Hill, Terranea Resort, Torrey Pines, Park Hyatt Aviara, La Quinta Resort & Club

Omni Amelia Island Specific Competitors:
The Ritz-Carlton Amelia Island, Sea Island Resort, Streamsong, Kiawah Island Golf Resort, PGA National, Innisbrook Resort

Omni Homestead Specific Competitors:
The Greenbrier, Pinehurst Resort, Nemacolin, Keswick Hall, Salamander Resort & Spa

OMNI GOLF COLLECTION (12 properties):
1. PGA Frisco (Frisco, TX) — PGA of America HQ campus, Fields Ranch East & West.
2. La Costa (Carlsbad, CA) — Gil Hanse-redesigned North Course. NCAA D1 Championships through 2028.
3. Amelia Island (FL) — $7.4M Oak Marsh renovation by Beau Welling Design (May 2025).
4. Barton Creek (Austin, TX) — Pair with PGA Frisco for Texas regional pitches.
5. Homestead (Hot Springs, VA) — $150M+ renovation 2023. Cascades top 50 in America.
6. Omni Mount Washington (Bretton Woods, NH) — Golf+ski pitches.
7. Omni Tucson National (Tucson, AZ)
8. Omni Interlocken (Broomfield, CO)
9. Omni Grove Park Inn (Asheville, NC)
10. Omni Scottsdale (Scottsdale, AZ)
11. Omni Hilton Head (Hilton Head, SC)
12. Omni Championsgate (Orlando, FL)`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { articles }: { articles: ArticleInput[] } = req.body;
    if (!articles?.length) return res.status(400).json({ error: 'articles array required' });

    let corrections: Record<string, string>[] = [];
    let mediaList: Record<string, string>[] = [];
    try {
      [corrections, mediaList] = await Promise.all([
        readSheetAsObjects('Scoring Corrections'),
        readSheetAsObjects('Media List'),
      ]);
    } catch { /* non-fatal */ }

    const correctionContext = corrections.length > 0
      ? corrections.map(c =>
          `In a previous session, "${c['Headline']}" was corrected from ${c['Original Score']} to ${c['Corrected Score']} because: ${c['Reason']}. Apply this pattern to similar articles.`
        ).join('\n')
      : '';

    const mediaNames = new Set(
      mediaList
        .map(m => (m['Name'] || '').toLowerCase().trim())
        .filter(Boolean)
    );

    function isKnownAuthor(authorName: string): boolean {
      const author = authorName.toLowerCase().trim();
      if (!author) return false;

      // Exact full name match
      if (mediaNames.has(author)) return true;

      // Check last name match (last word of author name)
      const authorParts = author.split(/\s+/);
      const authorLast = authorParts[authorParts.length - 1];

      // Check if any media contact's last name (last word) matches
      return Array.from(mediaNames).some(contactName => {
        const contactParts = contactName.split(/\s+/);
        const contactLast = contactParts[contactParts.length - 1];
        return authorLast === contactLast;
      });
    }

    const articlesText = articles.map((a, i) =>
      `${i + 1}. Headline: "${a.headline}" | Outlet: ${a.outlet} | Author: ${a.author} | UVM: ${a.uvm} | URL: ${a.url} | Date: ${a.publishDate}`
    ).join('\n');

    const userPrompt = `You are scoring ${articles.length} golf/travel media articles.

ARTICLES TO SCORE:
${articlesText}

TASK: Return a JSON array. One object per article. No other text, no markdown.

REQUIRED FIELDS (exact order):
{
  "index": number (1-based),
  "headline": string,
  "url": string,
  "outlet": string,
  "author": string,
  "publishDate": string,
  "uvm": string,
  "scoreTier": "High" | "Medium" | "Low" | "Discard",
  "articleType": string,
  "competitorProperty": string,
  "scoringExplanation": string,
  "pitchAngle": string,
  "syndicationCount": number,
  "isCanonical": boolean
}

START JSON ARRAY NOW:`;

    let result;
    try {
      console.log(`Calling Claude with ${articles.length} articles...`);
      result = await callClaude({
        userPrompt,
        contextString: [
          OMNI_SCORING_PROMPT,
          correctionContext ? `\nSCORING CORRECTIONS:\n${correctionContext}` : '',
        ].join('\n'),
      });
      console.log(`Claude response received: ${result.content.length} characters`);
    } catch (claudeErr) {
      console.error('=== CLAUDE API CALL FAILED ===');
      console.error('Error during callClaude:', claudeErr);
      console.error('=== END CLAUDE API CALL FAILED ===');
      throw new Error(`Claude API call failed: ${(claudeErr as Error).message}`);
    }

    let scored: ScoredArticle[] = [];
    try {
      if (!result.content || typeof result.content !== 'string' || result.content.length === 0) {
        throw new Error(`Claude returned empty or invalid response: "${result.content}"`);
      }

      let jsonStr: string | null = null;
      let workingContent = result.content.trim();

      // Strategy 1: Remove markdown code blocks if present
      const codeBlockMatch = workingContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        workingContent = codeBlockMatch[1].trim();
      }

      // Strategy 2: Try to parse entire content as JSON (handles objects with "results" or "data" fields)
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(workingContent);
        if (Array.isArray(parsed)) {
          jsonStr = workingContent;
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const obj = parsed as Record<string, unknown>;
          // Try common wrapper fields
          if (Array.isArray(obj.articles)) {
            jsonStr = JSON.stringify(obj.articles);
          } else if (Array.isArray(obj.results)) {
            jsonStr = JSON.stringify(obj.results);
          } else if (Array.isArray(obj.data)) {
            jsonStr = JSON.stringify(obj.data);
          } else if (Array.isArray(obj.scored)) {
            jsonStr = JSON.stringify(obj.scored);
          }
        }
      } catch {
        // Will try bracket extraction next
      }

      // Strategy 3: Find and extract JSON array by brackets
      if (!jsonStr) {
        const firstBracket = workingContent.indexOf('[');
        const lastBracket = workingContent.lastIndexOf(']');

        if (firstBracket >= 0 && lastBracket > firstBracket) {
          jsonStr = workingContent.substring(firstBracket, lastBracket + 1);
        }
      }

      if (!jsonStr) {
        const preview = result.content.slice(0, 500).replace(/\n/g, ' ').replace(/\s+/g, ' ');
        throw new Error(`No JSON array found. Response length: ${result.content.length}. Content: "${preview}"`);
      }

      let parsed2: unknown;
      try {
        parsed2 = JSON.parse(jsonStr);
      } catch (parseErr) {
        throw new Error(`JSON parse error: ${(parseErr as Error).message}. String: "${jsonStr.slice(0, 200)}"`);
      }

      if (!Array.isArray(parsed2)) {
        throw new Error(`Response is not an array. Type: ${typeof parsed2}`);
      }
      if (parsed2.length === 0) {
        throw new Error(`Response array is empty`);
      }

      parsed = parsed2;

      scored = parsed.map((item: Record<string, unknown>) => {
        const authorName = String(item.author || '');
        const scoreTier = item.scoreTier as ScoredArticle['scoreTier'] | undefined;
        const validTiers = ['High', 'Medium', 'Low', 'Discard'];
        if (!validTiers.includes(scoreTier || '')) {
          console.warn(`Invalid scoreTier "${scoreTier}", defaulting to Low`);
        }
        return {
          headline: String(item.headline || ''),
          url: String(item.url || ''),
          outlet: String(item.outlet || ''),
          author: authorName,
          publishDate: String(item.publishDate || ''),
          uvm: String(item.uvm || ''),
          scoreTier: validTiers.includes(scoreTier || '') ? (scoreTier as ScoredArticle['scoreTier']) : 'Low',
          articleType: String(item.articleType || ''),
          competitorProperty: String(item.competitorProperty || ''),
          scoringExplanation: String(item.scoringExplanation || ''),
          pitchAngle: String(item.pitchAngle || ''),
          syndicationCount: Number(item.syndicationCount) || 0,
          knownContact: isKnownAuthor(authorName),
          isCanonical: item.isCanonical !== false,
        } satisfies ScoredArticle;
      });
    } catch (e) {
      const errorMsg = (e as Error).message;
      console.error('=== SCORING ERROR ===');
      console.error('Error:', errorMsg);
      console.error('Response type:', typeof result.content);
      console.error('Response length:', result.content?.length || 0);
      console.error('Full response:');
      console.error(result.content);
      console.error('=== END SCORING ERROR ===');
      scored = articles.map(a => ({
        ...a,
        scoreTier: 'Low' as const,
        articleType: '',
        competitorProperty: '',
        scoringExplanation: 'Scoring parse error — defaulted to Low',
        pitchAngle: '',
        syndicationCount: 0,
        knownContact: isKnownAuthor(a.author),
        isCanonical: true,
      }));
    }

    // Validate HIGH tier articles against actual content
    const highArticles = scored.filter(a => a.scoreTier === 'High');
    if (highArticles.length > 0) {
      const validationTexts = await Promise.all(
        highArticles.map(async (a) => ({
          article: a,
          content: await fetchArticleText(a.url),
        }))
      );

      const articlesWithContent = validationTexts
        .filter(v => v.content)
        .map((v, i) => `${i + 1}. "${v.article.headline}" (${v.article.outlet})\n${v.article.content}\n---ACTUAL CONTENT---\n${v.content}`)
        .join('\n\n');

      if (articlesWithContent) {
        const validationPrompt = `Double-check these HIGH-scored articles against their actual content. For each, confirm if the HIGH tier is correct. If the content does NOT support a HIGH score (e.g., article is actually off-topic, a brief, or lacks Omni golf relevance), note that. Format: article number → "CONFIRM HIGH" or "DOWNGRADE TO [Medium/Low]" with 1-2 sentence reason.

${articlesWithContent}`;

        const validationResult = await callClaude({
          userPrompt: validationPrompt,
          contextString: OMNI_SCORING_PROMPT,
        });

        // Parse validation feedback and apply downgrades (but only if content was fetched)
        const validationLines = validationResult.content.split('\n').filter(l => l.trim());
        let validationIndex = 0;
        for (let i = 0; i < highArticles.length; i++) {
          const fetchedContent = validationTexts[i].content;
          if (!fetchedContent) continue; // Skip if we couldn't fetch

          const matchLine = validationLines.find(l => l.trim().startsWith(`${validationIndex + 1}`));
          if (matchLine?.includes('DOWNGRADE')) {
            const newTier = matchLine.includes('Medium') ? 'Medium' : matchLine.includes('Low') ? 'Low' : 'High';
            const originalIdx = scored.findIndex(s => s.url === highArticles[i].url);
            if (originalIdx >= 0 && newTier !== 'High') {
              scored[originalIdx].scoreTier = newTier;
              scored[originalIdx].scoringExplanation += ` [Downgraded after content check]`;
            }
          }
          validationIndex++;
        }
      }
    }

    const uploadDate = today();
    try {
      await appendToSheet('Scored Articles Log', scored.map(a => [
        a.headline, a.url, a.author, a.outlet, a.uvm,
        a.articleType, a.scoreTier, a.competitorProperty,
        a.scoringExplanation, a.pitchAngle,
        String(a.syndicationCount),
        a.knownContact ? 'Yes' : 'No',
        uploadDate,
      ]));
    } catch { /* non-fatal */ }

    const counts = scored.reduce(
      (acc, a) => {
        if (a.scoreTier === 'High') acc.high++;
        else if (a.scoreTier === 'Medium') acc.medium++;
        else if (a.scoreTier === 'Low') acc.low++;
        else acc.discarded++;
        return acc;
      },
      { high: 0, medium: 0, low: 0, discarded: 0 }
    );

    const validationNote = highArticles.length > 0
      ? `I'm double checking my work on ${highArticles.length} high priority ${highArticles.length === 1 ? 'article' : 'articles'} so you can impress Dan Surrette`
      : undefined;

    return res.json({ scored, counts, validationNote });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
