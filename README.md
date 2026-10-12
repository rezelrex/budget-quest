# Budget Quest

A gamified personal budget tracker. Upload your monthly bank statement PDF (built for DBS/POSB transaction history, works with most banks), and the app reads every transaction, sorts it into categories, and shows you where your money goes and where you can save. Then it turns saving into a game: XP, levels, streaks, badges, and savings quests.

## What it does

- **Upload**: drop a statement PDF or screenshot. Each page is rendered in your browser and read by Claude (vision), and every row comes back for you to check and fix before anything is saved. Uploading an overlapping statement skips the transactions that are already logged.
- **Overview**: totals, a health score, spending by category against your budget, spending per day, top merchants, and a **Where to save** list with estimated monthly savings.
- **Quests**: accept a savings quest (e.g. "halve the coffee runs") for the next month. Finishing under target earns XP.
- **Spending**: search and filter transactions. Recategorise one, and the app can remember the rule for that merchant for all future uploads.
- **Budget**: monthly limit per category (with suggestions from your history) and a savings goal.

### XP

| Action | XP |
|---|---|
| Statement uploaded | +100 |
| Budget set up | +50 |
| Savings goal set | +50 |
| Full month under total budget | +150 |
| Each category on target in a full month | +20 |
| Quest completed | +250 |

## Stack

- Next.js 15 (App Router), React 19, TypeScript, deployed on **Vercel**
- PostgreSQL on **Railway** (`pg`). Tables are created automatically on the first request.
- Anthropic API (Claude) for reading statement pages
- pdf.js renders PDF pages to images in the browser, so uploads stay small

## Environment variables

| Name | What it is |
|---|---|
| `DATABASE_URL` | Railway Postgres **public** connection string (`DATABASE_PUBLIC_URL` on the Railway Postgres service) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key, from console.anthropic.com |
| `APP_PASSCODE` | The passcode that unlocks the app. Changing it logs out every device. |
| `ANTHROPIC_MODEL` | Optional, defaults to `claude-sonnet-5-5` |

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

## Privacy

Your statements are never stored. Only the extracted rows are kept, with card and reference numbers stripped out. The whole app, including the API, sits behind the passcode. Don't commit statement PDFs; `.gitignore` already blocks `*.pdf`.
