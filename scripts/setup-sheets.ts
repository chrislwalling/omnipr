/**
 * Run once to scaffold the four required Google Sheets tabs.
 * Usage: npx ts-node scripts/setup-sheets.ts
 *
 * Requires GOOGLE_SHEETS_CREDENTIALS and OMNI_SHEET_ID env vars.
 */
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SHEET_ID = process.env.OMNI_SHEET_ID!;

const TABS: Record<string, string[]> = {
  'Media List': [
    'Outlet', 'First', 'Last', 'Contact', 'New Contact',
    'Source Article URL', 'Competitor Property Covered', 'Pitch Angle', 'Date Added',
  ],
  'Pitch Tracker': [
    'Journalist First', 'Journalist Last', 'Outlet', 'Omni Property',
    'Subject Line', 'Body', 'Date Saved', 'Status',
  ],
  'Scoring Corrections': [
    'Headline', 'Article URL', 'Original Score', 'Corrected Score', 'Reason', 'Timestamp',
  ],
  'Scored Articles Log': [
    'Headline', 'Article URL', 'Author', 'Outlet', 'UVM', 'Article Type',
    'Score Tier', 'Competitor Property', 'Scoring Explanation', 'Pitch Angle',
    'Syndication Count', 'Known Contact', 'Upload Date',
  ],
};

async function main() {
  const credentialsB64 = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!credentialsB64) throw new Error('GOOGLE_SHEETS_CREDENTIALS not set');
  const credentials = JSON.parse(Buffer.from(credentialsB64, 'base64').toString('utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Get existing sheet tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties.title' });
  const existingTabs = new Set((meta.data.sheets || []).map(s => s.properties?.title || ''));

  const requests: object[] = [];

  for (const [tabName, columns] of Object.entries(TABS)) {
    if (!existingTabs.has(tabName)) {
      console.log(`Creating tab: ${tabName}`);
      requests.push({
        addSheet: { properties: { title: tabName } },
      });
    } else {
      console.log(`Tab already exists: ${tabName}`);
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });
  }

  // Write headers to each tab
  for (const [tabName, columns] of Object.entries(TABS)) {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1:Z1`,
    });
    const firstRow = (existing.data.values || [[]])[0] || [];
    if (firstRow.length === 0) {
      console.log(`Writing headers for: ${tabName}`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [columns] },
      });
    } else {
      console.log(`Headers already set for: ${tabName}`);
    }
  }

  console.log('\nSetup complete. Sheet ID:', SHEET_ID);
}

main().catch(console.error);
