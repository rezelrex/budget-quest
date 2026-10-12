import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CATEGORY_IDS } from "@/lib/categories";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const ok =
    b &&
    CATEGORY_IDS.includes(b.category) &&
    typeof b.title === "string" &&
    Number(b.baseline) >= 0 &&
    Number(b.target) >= 0 &&
    /^\d{4}-\d{2}$/.test(b.month);
  if (!ok) return NextResponse.json({ error: "Bad quest" }, { status: 400 });
  const p = await db();
  await p.query(
    `INSERT INTO quests(category, title, baseline, target, month) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (category, month) DO UPDATE SET title=EXCLUDED.title, baseline=EXCLUDED.baseline, target=EXCLUDED.target`,
    [b.category, b.title.slice(0, 160), b.baseline, b.target, b.month]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const p = await db();
  await p.query(`DELETE FROM quests WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}
