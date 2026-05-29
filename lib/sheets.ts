import { google } from 'googleapis';

const SHEET_ID = process.env.OMNI_SHEET_ID!;

function getAuth() {
  const credentialsB64 = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!credentialsB64) throw new Error('GOOGLE_SHEETS_CREDENTIALS not set');
  const credentials = JSON.parse(Buffer.from(credentialsB64, 'base64').toString('utf-8'));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

export async function readSheet(tab: string, range?: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const fullRange = range ? `'${tab}'!${range}` : `'${tab}'`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: fullRange,
  });
  return (response.data.values as string[][]) || [];
}

export async function readSheetAsObjects(tab: string): Promise<Record<string, string>[]> {
  const rows = await readSheet(tab);
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });
}

export async function appendToSheet(tab: string, rows: string[][]): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${tab}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

export async function updateSheetRow(
  tab: string,
  rowIndex: number,
  values: string[]
): Promise<void> {
  const sheets = getSheetsClient();
  const colEnd = String.fromCharCode(64 + values.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${tab}'!A${rowIndex}:${colEnd}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

export async function getAllRows(tab: string): Promise<{ headers: string[]; rows: string[][]; objects: Record<string, string>[] }> {
  const raw = await readSheet(tab);
  if (raw.length === 0) return { headers: [], rows: [], objects: [] };
  const headers = raw[0];
  const rows = raw.slice(1);
  const objects = rows.map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });
  return { headers, rows, objects };
}
