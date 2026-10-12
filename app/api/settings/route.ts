import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED = new Set(["goal"]);

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const key = String(body?.key ?? "");
  if (!ALLOWED.has(key)) return NextResponse.json({ error: "Unknown setting" }, { status: 400 });
  const p = await db();
  await p.query(
    `INSERT INTO settings(key, value) VALUES ($1,$2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [key, JSON.stringify(body?.value ?? null)]
  );
  return NextResponse.json({ ok: true });
}
