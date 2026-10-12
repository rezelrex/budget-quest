"use client";
import { useRef, useState } from "react";
import { money } from "@/lib/analysis";
import { CATEGORIES, CategoryId } from "@/lib/categories";
import type { Ctx } from "./App";

interface Row {
  key: number;
  date: string;
  description: string;
  merchant: string;
  amount: number;
  category: CategoryId;
}

type Stage = "idle" | "reading" | "review" | "saving";

interface PageResult {
  period_label: string | null;
  transactions: { date: string | null; description: string; merchant: string; amount: number; category: CategoryId }[];
}

async function extractPage(image: string, attempt = 0): Promise<PageResult> {
  const r = await fetch("/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image, mediaType: "image/jpeg" }),
  });
  const j = await r.json().catch(() => ({ error: `Server error ${r.status}` }));
  if (!r.ok) {
    if (attempt < 1 && r.status >= 500) return extractPage(image, attempt + 1);
    throw new Error(j.error || `Server error ${r.status}`);
  }
  return j;
}

export default function Upload({ ctx }: { ctx: Ctx }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [label, setLabel] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function handle(file: File) {
    setError("");
    if (!/pdf|image\//.test(file.type)) {
      setError("That file isn't a PDF or image. Upload the PDF your bank lets you download.");
      return;
    }
    setStage("reading");
    setProgress(0);
    try {
      const { fileToPageImages } = await import("@/lib/pdf-client");
      setStatus("Opening the statement…");
      const pages = await fileToPageImages(file, setStatus);
      setStatus(`Reading ${pages.length} page${pages.length === 1 ? "" : "s"}…`);
      const results: PageResult[] = new Array(pages.length);
      let done = 0;
      let next = 0;
      const worker = async () => {
        while (next < pages.length) {
          const i = next++;
          results[i] = await extractPage(pages[i]);
          done++;
          setProgress(done / pages.length);
          setStatus(`Read ${done} of ${pages.length} pages…`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, pages.length) }, worker));

      // Rows at the top of a page with no date header continue the previous page's last date.
      let carry: string | null = null;
      const out: Row[] = [];
      let k = 0;
      for (const res of results) {
        for (const t of res.transactions) {
          const date = t.date || carry;
          if (t.date) carry = t.date;
          out.push({
            key: k++,
            date: date ?? "",
            description: t.description,
            merchant: t.merchant,
            amount: Number(t.amount),
            category: Number(t.amount) > 0 ? "income" : t.category,
          });
        }
      }
      if (!out.length) throw new Error("No transactions were found in that file. Check it's a transaction history, not a summary page.");
      const period = results.find((r) => r.period_label)?.period_label;
      setLabel(period || file.name.replace(/\.[^.]+$/, ""));
      setRows(out);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("idle");
    }
  }

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    setStage("saving");
    setError("");
    const r = await fetch("/api/statements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, transactions: rows }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error || "Saving failed. Your rows are still here — try again.");
      setStage("review");
      return;
    }
    await ctx.reload();
    ctx.toast(
      j.inserted
        ? `Saved ${j.inserted} transactions${j.skipped ? ` (${j.skipped} already logged)` : ""}`
        : `All ${j.skipped} transactions were already logged`
    );
    setRows([]);
    setStage("idle");
    ctx.go("overview");
  }

  const spend = rows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0);
  const income = rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const missingDates = rows.filter((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.date)).length;

  if (stage === "review" || stage === "saving") {
    return (
      <div className="stack">
        <section className="panel stack">
          <div>
            <h2>Check the haul</h2>
            <p className="muted">
              Found {rows.length} transactions. Compare the totals with your statement, fix anything misread, then save.
            </p>
          </div>
          <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="stat">
              <div className="v">{money(spend)}</div>
              <div className="l">Money out</div>
            </div>
            <div className="stat">
              <div className="v">{money(income)}</div>
              <div className="l">Money in</div>
            </div>
            <div className="stat">
              <div className="v">{rows.length}</div>
              <div className="l">Rows</div>
            </div>
          </div>
          <label className="stack" style={{ gap: 4 }}>
            <span className="faint">Statement name</span>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          {missingDates > 0 && <p className="err">{missingDates} rows have no date. Add one before saving, or remove them.</p>}
          {error && <p className="err">{error}</p>}
          <div className="row wrap">
            <button className="btn" onClick={save} disabled={stage === "saving" || missingDates > 0}>
              {stage === "saving" ? "Saving…" : `Save ${rows.length} transactions`}
            </button>
            <button className="btn ghost" onClick={() => { setRows([]); setStage("idle"); }} disabled={stage === "saving"}>
              Discard
            </button>
          </div>
        </section>

        <section className="panel">
          {rows.map((r) => (
            <div className="review-row" key={r.key}>
              <input className="input" type="date" aria-label="Date" value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} />
              <input className="input" aria-label="Merchant" value={r.merchant} onChange={(e) => update(r.key, { merchant: e.target.value })} />
              <div className="ctrl">
                <select
                  className="select"
                  aria-label="Category"
                  value={r.category}
                  disabled={r.amount > 0}
                  onChange={(e) => update(r.key, { category: e.target.value as CategoryId })}
                >
                  {CATEGORIES.filter((c) => (r.amount > 0 ? c.id === "income" : c.id !== "income")).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </select>
                <input
                  className="input num"
                  aria-label="Amount"
                  type="number"
                  step="0.01"
                  value={r.amount}
                  style={{ color: r.amount > 0 ? "var(--good)" : undefined, textAlign: "right" }}
                  onChange={(e) => {
                    const amount = Number(e.target.value);
                    update(r.key, { amount, category: amount > 0 ? "income" : r.category === "income" ? "other" : r.category });
                  }}
                />
                <button className="btn small danger" aria-label="Remove row" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                  ✕
                </button>
              </div>
              <div className="desc" title={r.description}>
                {r.description}
              </div>
            </div>
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      <div
        className={`drop ${drag ? "on" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => stage === "idle" && input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && stage === "idle" && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f && stage === "idle") handle(f);
        }}
      >
        <div className="big" aria-hidden>
          {stage === "reading" ? "🔍" : "📥"}
        </div>
        {stage === "reading" ? (
          <>
            <h2>Reading your statement</h2>
            <p className="muted">{status}</p>
            <div className="progress-line" style={{ width: "min(320px, 80%)" }}>
              <span style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
          </>
        ) : (
          <>
            <h2>Upload a statement</h2>
            <p className="muted">Drop your DBS/POSB transaction history PDF here, or tap to choose it. Screenshots work too.</p>
            <span className="btn">Choose file</span>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handle(f);
          }}
        />
      </div>
      {error && <p className="err">{error}</p>}
      <p className="faint">
        Each page is read by Claude and turned into rows you can check before anything is saved. Re-uploading an overlapping statement skips transactions that are already logged.
      </p>

      {ctx.data.statements.length > 0 && (
        <section className="panel">
          <h2 style={{ marginBottom: 8 }}>Logged statements</h2>
          {ctx.data.statements
            .slice()
            .reverse()
            .map((st) => (
              <div className="row between" key={st.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{st.label}</div>
                  <div className="faint">
                    {st.period_start} to {st.period_end} · {ctx.data.transactions.filter((t) => t.statement_id === st.id).length} transactions
                  </div>
                </div>
                <button
                  className="btn small danger"
                  onClick={async () => {
                    if (!confirm(`Delete "${st.label}" and all its transactions?`)) return;
                    await fetch(`/api/statements?id=${st.id}`, { method: "DELETE" });
                    await ctx.reload();
                    ctx.toast("Statement deleted");
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
