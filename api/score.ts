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

COMPETITOR PROPERTIES TO WATCH: Pebble Beach, Pinehurst, Kiawah Island, Sea Island, Streamsong, Bandon Dunes, TPC Sawgrass, Kohler (Whistling Straits/Blackwolf Run).

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
      mediaList.map(m => `${(m['First'] || '').toLowerCase()} ${(m['Last'] || '').toLowerCase()}`.trim())
    );

    const articlesText = articles.map((a, i) =>
      `${i + 1}. Headline: "${a.headline}" | Outlet: ${a.outlet} | Author: ${a.author} | UVM: ${a.uvm} | URL: ${a.url} | Date: ${a.publishDate}`
    ).join('\n');

    const userPrompt = `Score each of the following ${articles.length} articles for PR value to Omni Hotels & Resorts golf properties.\n\nApply the full scoring spec. Deduplicate syndicated content.\n\nArticles:\n${articlesText}\n\nReturn ONLY a JSON array with one object per UNIQUE article (Discards included with scoreTier: "Discard"). Each object:\n- index (1-based)
- headline
- url
- outlet
- author
- publishDate
- uvm
- scoreTier: "High" | "Medium" | "Low" | "Discard"
- articleType: Feature | Renovation | Championship | Rankings | Brief | Tee Times | Other
- competitorProperty: name of competitor property covered or ""
- scoringExplanation: 1-2 sentences
- pitchAngle: specific Omni angle if High or Medium, otherwise ""
- syndicationCount: number of duplicates (0 if unique)
- isCanonical: true if this is the record to show`;

    const result = await callClaude({
      userPrompt,
      contextString: [
        OMNI_SCORING_PROMPT,
        correctionContext ? `\nSCORING CORRECTIONS:\n${correctionContext}` : '',
      ].join('\n'),
    });

    let scored: ScoredArticle[] = [];
    try {
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        scored = parsed.map((item: Record<string, unknown>, i: number) => {
          const src = articles[i] || articles[0];
          const authorName = String(item.author || src.author || '').toLowerCase();
          return {
            headline: String(item.headline || src.headline),
            url: String(item.url || src.url),
            outlet: String(item.outlet || src.outlet),
            author: String(item.author || src.author),
            publishDate: String(item.publishDate || src.publishDate),
            uvm: String(item.uvm || src.uvm),
            scoreTier: (item.scoreTier as ScoredArticle['scoreTier']) || 'Low',
            articleType: String(item.articleType || ''),
            competitorProperty: String(item.competitorProperty || ''),
            scoringExplanation: String(item.scoringExplanation || ''),
            pitchAngle: String(item.pitchAngle || ''),
            syndicationCount: Number(item.syndicationCount) || 0,
            knownContact: mediaNames.has(authorName),
            isCanonical: item.isCanonical !== false,
          } satisfies ScoredArticle;
        });
      }
    } catch {
      scored = articles.map(a => ({
        ...a,
        scoreTier: 'Low' as const,
        articleType: '',
        competitorProperty: '',
        scoringExplanation: 'Scoring parse error — defaulted to Low',
        pitchAngle: '',
        syndicationCount: 0,
        knownContact: false,
        isCanonical: true,
      }));
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

    return res.json({ scored, counts });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
