# Omni PR Dashboard

A PR intelligence dashboard for Omni Hotels & Resorts, built for the Omni Golf Collection PR team.

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS (navy `#1B2F52`, gold `#C9A84C`)
- **Backend**: Vercel serverless functions (`/api/*.ts`)
- **Persistence**: Google Sheets API via `googleapis`
- **AI**: Anthropic Claude (`claude-sonnet-4-6`)
- **Notifications**: Slack Incoming Webhook

## Development

```bash
npm install
vercel dev        # Runs frontend + API routes with Vercel environment variables
```

**Important:** Always use `vercel dev` for local development. This loads environment variables from your Vercel project, so you don't need a `.env.local` file.

## Environment Variables

Set these in Vercel project settings (not in `.env.local`):

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `GOOGLE_SHEETS_CREDENTIALS` | Base64-encoded service account JSON |
| `OMNI_SHEET_ID` | Google Sheet ID |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL |

## One-Time Setup

Before first use, scaffold the Google Sheet tabs:

```bash
npx ts-node scripts/setup-sheets.ts
```

This creates four tabs: **Media List**, **Pitch Tracker**, **Scoring Corrections**, **Scored Articles Log**.

## Google Sheets Credentials

1. Create a Google Cloud service account with Sheets API enabled
2. Download the JSON key file
3. Base64 encode it: `base64 -i service-account.json`
4. Paste the output as `GOOGLE_SHEETS_CREDENTIALS`
5. Share the sheet with the service account email

## App Structure

```
api/                  Vercel serverless functions (Node.js)
  status.ts           GET  /api/status
  sheets-read.ts      POST /api/sheets-read
  sheets-write.ts     POST /api/sheets-write
  sheets-update.ts    POST /api/sheets-update
  muckrack-import.ts  POST /api/muckrack-import
  score.ts            POST /api/score
  draft-pitch.ts      POST /api/draft-pitch
  slack.ts            POST /api/slack

lib/                  Node.js helpers (imported by api/)
  sheets.ts           Google Sheets client
  claude.ts           Claude API client + system prompt

src/                  React frontend
  App.tsx             Root — tab router
  components/         Sidebar, SystemStatus, ScoreBadge, StatusBadge
  tabs/               NewsTab, MediaTab, PitchesTab, PitchTrackerTab
  types.ts            Shared TypeScript types
```

## Tabs

### News
Three-phase flow: Upload CSV → Analyzing (Claude scores) → Scored Articles.
- Accepts Muck Rack CSV or XLSX exports
- Scoring corrections are injected into every new scoring run (feedback loop)
- Slack fires automatically on completion
- "Add to Media List" and "Write Pitch" buttons on each article card

### Media
Editable table of journalists synced to Google Sheets.
- Inline editing of all fields, saves on blur
- New Contact badge toggleable
- Write Pitch button launches pitch wizard with pre-filled context

### Pitches
Step-by-step pitch generation wizard:
1. Journalist context (pre-filled from News or Media)
2. Property selection (12 Omni Golf Collection properties; 5 priority listed first)
3. Claude generates subject line + body
4. User can edit directly or regenerate with feedback note
5. Save to Pitch Tracker writes to Google Sheets as Draft

### Pitch Tracker
Table of all saved pitches from Google Sheets.
- Inline status dropdown (Draft / Sent / Followed Up / Responded / Closed)
- Status changes write back to Sheets immediately
- Sortable by date or status

## Scoring Spec

Full spec is in `api/score.ts` (`OMNI_SCORING_PROMPT` constant). Key rules:
- HIGH = 5–6 | MEDIUM = 3–4 | LOW = 1–2 | DISCARD = 0
- Discard: tournament coverage, LIV, betting, player profiles, press releases
- Scoring corrections feedback loop: prior corrections auto-injected into each new run

## Omni Golf Collection Properties

**Priority (pitch these first):**
1. PGA Frisco — PGA HQ campus, Fields Ranch East & West
2. La Costa — Gil Hanse North Course, NCAA D1 through 2028
3. Amelia Island — $7.4M Oak Marsh renovation May 2025
4. Barton Creek — Austin TX (pair with PGA Frisco)
5. Homestead — $150M+ renovation, Cascades top 50

**Other 7:** Mount Washington, Tucson National, Interlocken, Grove Park Inn, Scottsdale, Hilton Head, Championsgate
