import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/categories";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const categoryGuide = CATEGORIES.map((c) => `- ${c.id}: ${c.label} (${c.hint})`).join("\n");

const SYSTEM = `You read one page of a bank account transaction history (typically DBS/POSB Singapore, but any bank) and extract every transaction row exactly.

Rules:
- Each transaction has a description line and an amount. Debits/spending are NEGATIVE numbers, credits/money in are POSITIVE (credits are often shown in green or without a minus sign).
- Dates come from the section headers above groups of rows (e.g. "Saturday, 10 Oct 2026", "Yesterday, 11 Oct 2026", "5 Oct 2026"). Use the header date in YYYY-MM-DD for every row under it. Rows that appear on this page BEFORE the first date header get date null (they continue the previous page).
- Ignore balances, account numbers, page numbers, headers and footers. Never invent rows. Copy amounts exactly to the cent.
- description: the first line of the row, but with any card number (e.g. 4284-2510-0017-7905) and long reference/transaction numbers removed. Keep the transaction type, merchant text and the purchase date (e.g. "BAT SUKIYA - FUNAN SI SGP 07OCT").
- merchant: a short, clean, human-friendly merchant name, consistent across rows (e.g. "Sukiya Funan", "Bus/MRT", "HelloRide", "SP Utilities", "PayNow to MUHAMXXX HAZXX", "Deloitte (salary)", "Cashback"). Strip card numbers and reference numbers.
- category: one of:
${categoryGuide}
  Every positive amount is "income". Bus/MRT, HelloRide, Grab rides are transport. Coffee chains, bubble tea (ITEA, Old Tea Hut, Chagee, Luckin, Coffee Bean) and drinks stalls are coffee. PayNow/FAST transfers to masked personal names are people; to a business (Pte Ltd, stall, QR merchant) categorise by the business.
- If the page shows a statement period (e.g. "September 2026 - October 2026"), return it in period_label.`;

const TOOL: Anthropic.Tool = {
  name: "record_transactions",
  description: "Record every transaction row found on this statement page.",
  input_schema: {
    type: "object",
    properties: {
      period_label: { type: ["string", "null"] },
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: ["string", "null"], description: "YYYY-MM-DD or null if before the first date header" },
            description: { type: "string" },
            merchant: { type: "string" },
            amount: { type: "number", description: "Negative for money out, positive for money in" },
            category: { type: "string", enum: CATEGORY_IDS },
          },
          required: ["date", "description", "merchant", "amount", "category"],
        },
      },
    },
    required: ["transactions"],
  },
};

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured on the server." }, { status: 500 });
  }
  const body = await req.json().catch(() => null);
  const image: string | undefined = body?.image; // base64 JPEG/PNG without data: prefix
  const mediaType: string = body?.mediaType || "image/jpeg";
  if (!image || image.length > 4_000_000) {
    return NextResponse.json({ error: "Missing or oversized page image" }, { status: 400 });
  }

  const client = new Anthropic();
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png", data: image },
            },
            { type: "text", text: "Extract every transaction on this page." },
          ],
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("No structured output returned");
    const input = block.input as { period_label?: string | null; transactions: unknown[] };
    return NextResponse.json({ period_label: input.period_label ?? null, transactions: input.transactions ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Reading the page failed: ${message}` }, { status: 502 });
  }
}
