import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __bqPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __bqSchema: Promise<void> | undefined;
}

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new Pool({
    connectionString: url,
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: 3,
  });
}

export function pool(): Pool {
  if (!global.__bqPool) global.__bqPool = makePool();
  return global.__bqPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS statements (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  statement_id INTEGER REFERENCES statements(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  merchant TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date);
CREATE TABLE IF NOT EXISTS budgets (
  category TEXT PRIMARY KEY,
  monthly_limit NUMERIC(12,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS merchant_rules (
  merchant TEXT PRIMARY KEY,
  category TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS quests (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  baseline NUMERIC(12,2) NOT NULL,
  target NUMERIC(12,2) NOT NULL,
  month TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, month)
);
`;

export async function db(): Promise<Pool> {
  const p = pool();
  if (!global.__bqSchema) {
    global.__bqSchema = p.query(SCHEMA).then(() => undefined);
    global.__bqSchema.catch(() => (global.__bqSchema = undefined));
  }
  await global.__bqSchema;
  return p;
}
