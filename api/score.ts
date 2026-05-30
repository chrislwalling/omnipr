import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callClaude, today } from '../lib/claude.js';
import { readSheetAsObjects, appendToSheet } from '../lib/sheets.js';
import type { ArticleInput, ScoredArticle } from '../src/types.js';

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

async function scoreBatch(
  batchArticles: ArticleInput[],
  batchIndex: number,
  correctionContext: string,
  mediaNames: Set<string>
): Promise<ScoredArticle[]> {
  function isKnownAuthor(authorName: string): boolean {
    const author = authorName.toLowerCase().trim();
    if (!author) return false;
    if (mediaNames.has(author)) return true;
    const authorParts = author.split(/\s+/);
    const authorLast = authorParts[authorParts.length - 1];
    return Array.from(mediaNames).some(contactName => {
      const contactParts = contactName.split(/\s+/);
      const contactLast = contactParts[contactParts.length - 1];
      return authorLast === contactLast;
    });
  }

  const articlesText = batchArticles.map((a, i) =>
    `${i + 1}. Headline: "${a.headline}" | Outlet: ${a.outlet} | Author: ${a.author} | UVM: ${a.uvm} | URL: ${a.url} | Date: ${a.publishDate}`
  ).join('\n');

  const userPrompt = `You are scoring ${batchArticles.length} golf/travel media articles (batch ${batchIndex}).

ARTICLES TO SCORE:
${articlesText}

TASK: Return a JSON array. One object per article. No other text, no markdown.

FIELD DEFINITIONS:
- index: 1-based position in the list above
- headline/url/outlet/author/publishDate/uvm: copy from input
- scoreTier: "High" | "Medium" | "Low" | "Discard" — apply the scoring formula from context (Reach + Article Type + Outlet Tier)
- articleType: one of "Feature", "Renovation", "Championship", "Rankings", "Brief", "Tee Times", "Press Release", or the most fitting label
- competitorProperty: if the article covers or prominently mentions a property from the COMPETITOR PROPERTIES list in your context, name it exactly (e.g. "Pinehurst Resort"). If none, use ""
- scoringExplanation: show the arithmetic — "Reach (X) + Article Type (X) + Outlet Tier (X) = Y. [1 sentence on why]". For Discard, state the discard rule triggered.
- pitchAngle: if scoreTier is NOT Discard, write 1–2 sentences on how the Omni PR team could use this article as a hook to pitch a specific Omni Golf Collection property. Name the property. If Discard, use "".
- syndicationCount: 0 unless you detect duplicate headlines; set count on the canonical, 0 on duplicates
- isCanonical: true unless this article is a lower-UVM duplicate of another in this batch

REQUIRED FIELDS (exact order):
{
  "index": number,
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
    console.log(`[BATCH ${batchIndex}] Calling Claude with ${batchArticles.length} articles...`);
    result = await callClaude({
      userPrompt,
      contextString: [
        OMNI_SCORING_PROMPT,
        correctionContext ? `\nSCORING CORRECTIONS:\n${correctionContext}` : '',
      ].join('\n'),
    });
    console.log(`[BATCH ${batchIndex}] Claude response received: ${result.content.length} characters`);
  } catch (claudeErr) {
    console.error(`[BATCH ${batchIndex}] CLAUDE API CALL FAILED`);
    console.error('Error:', claudeErr);
    throw new Error(`Claude API call failed for batch ${batchIndex}: ${(claudeErr as Error).message}`);
  }

  let scored: ScoredArticle[] = [];
  try {
    if (!result.content || typeof result.content !== 'string' || result.content.length === 0) {
      throw new Error(`Claude returned empty or invalid response`);
    }

    let jsonStr: string | null = null;
    let workingContent = result.content.trim();

    let extracted = workingContent;
    const codeBlockPatterns = [
      /```(?:json)?\s*([\s\S]*?)\s*```/,
    ];
    for (const pattern of codeBlockPatterns) {
      const match = extracted.match(pattern);
      if (match && match[1]) {
        extracted = match[1].trim();
        break;
      }
    }

    const firstBracket = extracted.indexOf('[');
    const lastBracket = extracted.lastIndexOf(']');

    if (firstBracket >= 0 && lastBracket > firstBracket) {
      jsonStr = extracted.substring(firstBracket, lastBracket + 1);
    }

    if (!jsonStr) {
      try {
        const parsed = JSON.parse(extracted);
        if (Array.isArray(parsed)) {
          jsonStr = extracted;
        } else if (parsed && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
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
      } catch { /* ignore */ }
    }

    if (!jsonStr) {
      const preview = result.content.slice(0, 500).replace(/\n/g, ' ').replace(/\s+/g, ' ');
      throw new Error(`No JSON array found. Response length: ${result.content.length}`);
    }

    let parsed2: unknown;
    try {
      parsed2 = JSON.parse(jsonStr);
    } catch (parseErr) {
      throw new Error(`JSON parse error: ${(parseErr as Error).message}`);
    }

    if (!Array.isArray(parsed2)) {
      throw new Error(`Response is not an array`);
    }

    scored = parsed2.map((item: Record<string, unknown>) => {
      const authorName = String(item.author || '');
      const scoreTier = item.scoreTier as ScoredArticle['scoreTier'] | undefined;
      const validTiers = ['High', 'Medium', 'Low', 'Discard'];
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
    console.error(`[BATCH ${batchIndex}] SCORING ERROR: ${errorMsg}`);
    scored = batchArticles.map(a => ({
      ...a,
      scoreTier: 'Low' as const,
      articleType: '',
      competitorProperty: '',
      scoringExplanation: `Batch scoring error — defaulted to Low`,
      pitchAngle: '',
      syndicationCount: 0,
      knownContact: isKnownAuthor(a.author),
      isCanonical: true,
    }));
  }
  return scored;
}


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

    // Batching and rate-limit delays are handled by the frontend.
    // This handler scores one batch of articles (≤20) per call.
    const scored = await scoreBatch(articles, 1, correctionContext, mediaNames);

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

    return res.json({ scored, counts });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
