import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CATEGORY_IDS } from "@/lib/categories";

export const runtime = "nodejs";

/** Recategorise one transaction; optionally remember the rule for the merchant and apply it everywhere. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const category = String(body?.category ?? "");
  if (!Number.isInteger(id) || !CATEGORY_IDS.includes(category as never) || category === "income") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const p = await db();
  const tx = await p.query(`SELECT merchant FROM transactions WHERE id=$1`, [id]);
  if (!tx.rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const merchant: string = tx.rows[0].merchant;

  if (body?.applyToMerchant) {
    await p.query(
      `INSERT INTO merchant_rules(merchant, category) VALUES ($1,$2)
       ON CONFLICT (merchant) DO UPDATE SET category=EXCLUDED.category`,
      [merchant, category]
    );
    const r = await p.query(
      `UPDATE transactions SET category=$2 WHERE lower(merchant)=lower($1) AND amount < 0`,
      [merchant, category]
    );
    return NextResponse.json({ updated: r.rowCount });
  }
  await p.query(`UPDATE transactions SET category=$2 WHERE id=$1`, [id, category]);
  return NextResponse.json({ updated: 1 });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const p = await db();
  await p.query(`DELETE FROM transactions WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}
