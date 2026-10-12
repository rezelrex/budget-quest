"use client";
import { useMemo, useState } from "react";
import { money, shortDate, summarize } from "@/lib/analysis";
import { CATEGORIES, cat, CategoryId } from "@/lib/categories";
import type { Ctx } from "./App";
import { PeriodPicker, usePeriods } from "./shared";

export default function Transactions({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const { periods, period, setKey } = usePeriods(data);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CategoryId | "">("");
  const [remember, setRemember] = useState(true);

  const s = useMemo(() => (period ? summarize(data.transactions, period) : null), [data, period]);
  const rows = useMemo(() => {
    if (!s) return [];
    const needle = q.trim().toLowerCase();
    return s.txs
      .filter((t) => !filter || t.category === filter)
      .filter((t) => !needle || t.merchant.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  }, [s, q, filter]);

  if (!s || !period) {
    return (
      <div className="panel empty">
        <div className="big">🧾</div>
        <p className="muted">No transactions yet.</p>
        <button className="btn" onClick={() => ctx.go("upload")}>
          Upload a statement
        </button>
      </div>
    );
  }

  const total = rows.reduce((a, t) => a + t.amount, 0);

  async function recategorise(id: number, category: CategoryId) {
    const r = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, category, applyToMerchant: remember }),
    });
    const j = await r.json().catch(() => ({}));
    await ctx.reload();
    ctx.toast(remember && j.updated > 1 ? `Moved ${j.updated} transactions to ${cat(category).label}` : `Moved to ${cat(category).label}`);
  }

  let lastDay = "";
  return (
    <div className="stack">
      <div className="row wrap">
        <PeriodPicker periods={periods} value={period} onChange={setKey} />
        <select className="select" aria-label="Category" value={filter} onChange={(e) => setFilter(e.target.value as CategoryId | "")}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
        <input className="input" style={{ flex: "1 1 180px", width: "auto" }} placeholder="Search merchant" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="row between wrap">
        <span className="muted num">
          {rows.length} transactions · net {total < 0 ? "−" : "+"}
          {money(total)}
        </span>
        <label className="row faint" style={{ gap: 6 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          When I change a category, apply it to every transaction from that merchant
        </label>
      </div>
      <section className="panel tx-list">
        {rows.length === 0 && <p className="muted">Nothing matches.</p>}
        {rows.map((t) => {
          const head = t.date !== lastDay ? t.date : null;
          lastDay = t.date;
          return (
            <div key={t.id}>
              {head && <div className="day-head">{shortDate(head)}</div>}
              <div className="tx" style={head ? { borderTop: 0 } : undefined}>
                <span className="m">
                  {cat(t.category).emoji} {t.merchant}
                </span>
                <span className={`a ${t.amount > 0 ? "in" : ""}`}>
                  {t.amount > 0 ? "+" : "−"}
                  {money(t.amount)}
                </span>
                <span className="d" title={t.description}>
                  {t.description}
                </span>
                {t.amount < 0 ? (
                  <select aria-label={`Category for ${t.merchant}`} value={t.category} onChange={(e) => recategorise(t.id, e.target.value as CategoryId)}>
                    {CATEGORIES.filter((c) => c.id !== "income").map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="pill good" style={{ justifySelf: "end" }}>
                    Money in
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
