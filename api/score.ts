import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callClaude, today } from '../lib/claude.js';
import { readSheetAsObjects, appendToSheet, updateSheetRow } from '../lib/sheets.js';
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

COMPETITOR DETECTION (required — read carefully):
For EACH article, actively scan the headline AND the snippet text for the exact name of any competitor from the lists below.
- If a competitor name appears anywhere in the article data, set competitorProperty to the exact name (e.g. "The Greenbrier", "Streamsong", "Kiawah Island Golf Resort").
- If multiple competitors appear, list them comma-separated.
- If no competitor is found, set competitorProperty to an empty string "".
- Do NOT skip this field. A competitor mention in the snippet is the primary reason these articles were flagged.

COMPETITOR PROPERTIES — ALL PROPERTIES:
Streamsong, Destination Kohler, Pinehurst Resort, Cabot, Bandon Dunes, Kiawah Island Golf Resort

COMPETITOR PROPERTIES — PGA FRISCO SPECIFIC:
Horseshoe Bay Resort, Lajitas Golf Resort, The Woodlands Resort, Streamsong Resort, Kiawah Island Golf Resort, Destination Kohler

COMPETITOR PROPERTIES — BARTON CREEK SPECIFIC:
Horseshoe Bay Resort, Tapatio Springs Hill Country Resort, La Cantera Resort, JW Marriott San Antonio Hill Country Resort & Spa, The Woodlands Resort, Lajitas Golf Resort

COMPETITOR PROPERTIES — LA COSTA SPECIFIC:
The Resort at Pelican Hill, Terranea Resort, Torrey Pines, Park Hyatt Aviara, La Quinta Resort & Club

COMPETITOR PROPERTIES — AMELIA ISLAND SPECIFIC:
The Ritz-Carlton Amelia Island, Sea Island Resort, Streamsong, Kiawah Island Golf Resort, PGA National, Innisbrook Resort

COMPETITOR PROPERTIES — HOMESTEAD SPECIFIC:
The Greenbrier, Pinehurst Resort, Nemacolin, Keswick Hall, Salamander Resort & Spa

OMNI GOLF COLLECTION (12 properties):
1. Omni PGA Frisco (Frisco, TX) — PGA of America HQ campus, Fields Ranch East & West.
2. Omni La Costa (Carlsbad, CA) — Gil Hanse-redesigned North Course. NCAA D1 Championships through 2028.
3. Omni Amelia Island (FL) — $7.4M Oak Marsh renovation by Beau Welling Design (May 2025).
4. Omni Barton Creek (Austin, TX) — Pair with Omni PGA Frisco for Texas regional pitches.
5. Omni Homestead (Hot Springs, VA) — $150M+ renovation 2023. Cascades top 50 in America.
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
    return mediaNames.has(author);
  }

  const articlesText = batchArticles.map((a, i) =>
    `${i + 1}. Headline: "${a.headline}" | Outlet: ${a.outlet} | Author: ${a.author} | UVM: ${a.uvm} | URL: ${a.url} | Date: ${a.publishDate}${a.snippet ? ` | Snippet: ${a.snippet}` : ''}`
  ).join('\n');

  const userPrompt = `You are scoring ${batchArticles.length} golf/travel media articles (batch ${batchIndex}).

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

    console.log(`Scoring ${articles.length} articles...`);
    let scored = await scoreBatch(articles, 1, correctionContext, mediaNames);

    // Validate HIGH tier articles against actual content
    const highArticles = scored.filter(a => a.scoreTier === 'High');
    if (highArticles.length > 0) {
      console.log(`Validating ${highArticles.length} HIGH-tier articles...`);
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

    try {
      const metricsRows = await readSheetAsObjects('My Metrics');
      const todayStr = uploadDate;
      const todayIdx = metricsRows.findIndex(r => r['Date'] === todayStr);
      if (todayIdx >= 0) {
        const e = metricsRows[todayIdx];
        await updateSheetRow('My Metrics', todayIdx + 2, [
          todayStr,
          String((parseInt(e['Article Scored'] || '0') || 0) + scored.length),
          String(parseInt(e['New Contacts Added'] || '0') || 0),
          String(parseInt(e['Pitches Drafted'] || '0') || 0),
          String(parseInt(e['Opportunities Created'] || '0') || 0),
        ]);
      } else {
        await appendToSheet('My Metrics', [[
          todayStr,
          String(scored.length),
          '0', '0', '0',
        ]]);
      }
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
