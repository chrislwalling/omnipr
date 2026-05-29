import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';

function parseUvm(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.KkMmBb]/g, '');
  if (!cleaned) return 0;
  const lower = cleaned.toLowerCase();
  if (lower.endsWith('b')) return parseFloat(lower) * 1_000_000_000;
  if (lower.endsWith('m')) return parseFloat(lower) * 1_000_000;
  if (lower.endsWith('k')) return parseFloat(lower) * 1_000;
  return parseFloat(cleaned) || 0;
}

// Columns to explicitly ignore from Muck Rack exports
const IGNORED_COLUMNS = new Set(['PR Hit Score', 'Sentiment']);

// Resolve which raw key maps to each semantic field.
// Tries exact Muck Rack header names first, then falls back to regex.
function resolveKey(
  keys: string[],
  exactNames: string[],
  fallbackRegex: RegExp
): string {
  for (const name of exactNames) {
    if (keys.includes(name)) return name;
  }
  return keys.find(k => !IGNORED_COLUMNS.has(k) && fallbackRegex.test(k)) || '';
}

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });
    const body = Buffer.concat(chunks);

    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) return res.status(400).json({ error: 'Missing boundary' });
    const boundary = boundaryMatch[1].trim();
    const sep = Buffer.from(`--${boundary}`);

    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let start = 0;
    while (start < body.length) {
      const sepIdx = body.indexOf(sep, start);
      if (sepIdx === -1) break;
      const partStart = sepIdx + sep.length + 2;
      const nextSep = body.indexOf(sep, partStart);
      const partEnd = nextSep === -1 ? body.length : nextSep - 2;
      const part = body.slice(partStart, partEnd);
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) { start = nextSep === -1 ? body.length : nextSep; continue; }
      const headers = part.slice(0, headerEnd).toString();
      const fileData = part.slice(headerEnd + 4);
      if (headers.includes('filename=')) {
        const fnMatch = headers.match(/filename="([^"]+)"/);
        if (fnMatch) fileName = fnMatch[1];
        fileBuffer = fileData;
      }
      start = nextSep === -1 ? body.length : nextSep;
    }

    if (!fileBuffer) return res.status(400).json({ error: 'No file found in upload' });

    const isCSV = fileName.toLowerCase().endsWith('.csv');
    let rawRows: Record<string, string>[];

    if (isCSV) {
      const text = fileBuffer.toString('utf-8');
      const workbook = XLSX.read(text, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
    } else {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellFormula: true });
      let bestSheet = workbook.SheetNames[0];
      for (const name of workbook.SheetNames) {
        if (Object.keys(workbook.Sheets[name] || {}).length > 5) { bestSheet = name; break; }
      }
      rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[bestSheet], { defval: '', raw: false });
    }

    if (!rawRows.length) return res.status(400).json({ error: 'No rows found in file' });

    const keys = Object.keys(rawRows[0]);
    console.log(`[muckrack-import] Columns found: ${keys.join(', ')}`);
    console.log(`[muckrack-import] First row sample:`, rawRows[0]);

    // Resolve column keys: exact Muck Rack names first, then regex fallback
    const headlineKey = resolveKey(keys, ['Article'], /headline|title/i);
    const urlKey      = resolveKey(keys, ['URL'],     /^url$|\burl\b|link/i);
    const authorKey   = resolveKey(keys, ['Author'],  /author|writer|journalist/i);
    const outletKey   = resolveKey(keys, ['Media Outlet'], /outlet|publication|source/i);
    const dateKey     = resolveKey(keys, ['Published'], /date|published/i);
    const uvmKey      = resolveKey(keys, ['UVM (Insights by Similarweb)'], /uvm|unique.*monthly|monthly.*unique/i);
    const snippetKey  = resolveKey(keys, ['Snippet'], /snippet|summary|excerpt/i);

    // Extra fields stored for context, not scored
    const topicsKey            = keys.find(k => k === 'Topics') || '';
    const journalistSharesKey  = keys.find(k => k === 'Journalist Shares') || '';
    const journalistReachKey   = keys.find(k => k === 'Journalist Reach') || '';
    const totalEngagementKey   = keys.find(k => k === 'Total Engagement') || '';
    const pitchPlacementKey    = keys.find(k => k === 'Pitch Placement') || '';

    const articles = rawRows
      .map(row => ({
        headline:          row[headlineKey] || '',
        url:               row[urlKey] || '',
        outlet:            row[outletKey] || '',
        author:            row[authorKey] || '',
        publishDate:       row[dateKey] || '',
        uvm:               String(parseUvm(row[uvmKey] || '')),
        snippet:           row[snippetKey] || '',
        topics:            row[topicsKey] || '',
        journalistShares:  row[journalistSharesKey] || '',
        journalistReach:   row[journalistReachKey] || '',
        totalEngagement:   row[totalEngagementKey] || '',
        pitchPlacement:    row[pitchPlacementKey] || '',
      }))
      .filter(a => a.headline || a.url);

    if (!articles.length) {
      console.log(`[muckrack-import] No articles passed filter. Keys: ${keys.join(', ')}`);
      console.log(`[muckrack-import] Resolved: headline="${headlineKey}", url="${urlKey}", outlet="${outletKey}", author="${authorKey}"`);
      return res.status(400).json({
        error: 'No valid articles found in file',
        details: `Could not find headline/url columns. Found columns: ${keys.join(', ')}`,
      });
    }

    return res.json({ articles, totalRows: rawRows.length, parsedRows: articles.length });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
