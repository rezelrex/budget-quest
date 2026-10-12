import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const p = await db();
    const [statements, transactions, budgets, settings, quests] = await Promise.all([
      p.query(`SELECT id, label, to_char(period_start,'YYYY-MM-DD') AS period_start, to_char(period_end,'YYYY-MM-DD') AS period_end, uploaded_at FROM statements ORDER BY period_start NULLS LAST, id`),
      p.query(`SELECT id, statement_id, to_char(date,'YYYY-MM-DD') AS date, description, merchant, amount::float AS amount, category FROM transactions ORDER BY date DESC, id`),
      p.query(`SELECT category, monthly_limit::float AS monthly_limit FROM budgets`),
      p.query(`SELECT key, value FROM settings`),
      p.query(`SELECT id, category, title, baseline::float AS baseline, target::float AS target, month, created_at FROM quests ORDER BY month, id`),
    ]);
    return NextResponse.json({
      statements: statements.rows,
      transactions: transactions.rows,
      budgets: Object.fromEntries(budgets.rows.map((r) => [r.category, r.monthly_limit])),
      settings: Object.fromEntries(settings.rows.map((r) => [r.key, r.value])),
      quests: quests.rows,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
