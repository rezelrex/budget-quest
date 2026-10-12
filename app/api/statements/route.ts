import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { CATEGORY_IDS } from "@/lib/categories";

export const runtime = "nodejs";

interface IncomingTx {
  date: string;
  description: string;
  merchant: string;
  amount: number;
  category: string;
}

const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rows: IncomingTx[] = Array.isArray(body?.transactions) ? body.transactions : [];
  const valid = rows.filter(
    (t) => isDate(t.date) && typeof t.description === "string" && Number.isFinite(Number(t.amount)) && Number(t.amount) !== 0
  );
  if (!valid.length) return NextResponse.json({ error: "No valid transactions to save" }, { status: 400 });

  const dates = valid.map((t) => t.date).sort();
  const label: string = (body?.label || `${dates[0]} → ${dates[dates.length - 1]}`).slice(0, 120);

  const p = await db();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const rules = await client.query(`SELECT merchant, category FROM merchant_rules`);
    const ruleMap = new Map<string, string>(rules.rows.map((r) => [r.merchant.toLowerCase(), r.category]));

    const st = await client.query(
      `INSERT INTO statements(label, period_start, period_end) VALUES ($1,$2,$3) RETURNING id`,
      [label, dates[0], dates[dates.length - 1]]
    );
    const statementId = st.rows[0].id;

    const seen = new Map<string, number>();
    let inserted = 0;
    for (const t of valid) {
      const amount = Math.round(Number(t.amount) * 100) / 100;
      const merchant = (t.merchant || t.description).trim().slice(0, 120);
      let category = CATEGORY_IDS.includes(t.category as never) ? t.category : "other";
      if (amount > 0) category = "income";
      else if (ruleMap.has(merchant.toLowerCase())) category = ruleMap.get(merchant.toLowerCase())!;

      const base = `${t.date}|${t.description.replace(/\s+/g, " ").trim().toUpperCase()}|${amount.toFixed(2)}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const hash = createHash("sha256").update(`${base}|${n}`).digest("hex");

      const r = await client.query(
        `INSERT INTO transactions(statement_id, date, description, merchant, amount, category, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (hash) DO NOTHING`,
        [statementId, t.date, t.description.slice(0, 300), merchant, amount, category, hash]
      );
      inserted += r.rowCount ?? 0;
    }
    if (inserted === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ inserted: 0, skipped: valid.length, statementId: null });
    }
    await client.query("COMMIT");
    return NextResponse.json({ inserted, skipped: valid.length - inserted, statementId });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const p = await db();
  await p.query(`DELETE FROM statements WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}
