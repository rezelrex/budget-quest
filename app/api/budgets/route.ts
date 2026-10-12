import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CATEGORY_IDS } from "@/lib/categories";

export const runtime = "nodejs";

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const budgets: Record<string, number | null> = body?.budgets ?? {};
  const p = await db();
  for (const [category, value] of Object.entries(budgets)) {
    if (!CATEGORY_IDS.includes(category as never) || category === "income") continue;
    if (value === null || !(Number(value) > 0)) {
      await p.query(`DELETE FROM budgets WHERE category=$1`, [category]);
    } else {
      await p.query(
        `INSERT INTO budgets(category, monthly_limit) VALUES ($1,$2)
         ON CONFLICT (category) DO UPDATE SET monthly_limit=EXCLUDED.monthly_limit`,
        [category, Math.round(Number(value) * 100) / 100]
      );
    }
  }
  return NextResponse.json({ ok: true });
}
