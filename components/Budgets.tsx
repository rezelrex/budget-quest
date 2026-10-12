"use client";
import { useEffect, useState } from "react";
import { dataRange, money, suggestBudgets, summarize } from "@/lib/analysis";
import { SPEND_CATEGORIES } from "@/lib/categories";
import type { Ctx } from "./App";

export default function Budgets({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const [vals, setVals] = useState<Record<string, string>>({});
  const [goalName, setGoalName] = useState(data.settings.goal?.name ?? "");
  const [goalAmt, setGoalAmt] = useState(data.settings.goal?.amount ? String(data.settings.goal.amount) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setVals(Object.fromEntries(SPEND_CATEGORIES.map((c) => [c.id, data.budgets[c.id] ? String(data.budgets[c.id]) : ""])));
  }, [data.budgets]);

  const range = dataRange(data.transactions);
  const hist = range ? summarize(data.transactions, { key: "all", label: "", kind: "all", start: range.min, end: range.max }) : null;
  const monthlyAvg = (id: string) => {
    if (!hist || !hist.days) return 0;
    const c = hist.byCategory.find((x) => x.id === id);
    return ((c?.total ?? 0) * 30.4) / hist.days;
  };
  const total = Object.values(vals).reduce((a, v) => a + (Number(v) || 0), 0);
  const avgTotal = hist && hist.days ? (hist.spend * 30.4) / hist.days : 0;
  const avgIncome = hist && hist.days ? (hist.income * 30.4) / hist.days : 0;
  const saved = hist ? Math.max(0, hist.net) : 0;
  const goal = data.settings.goal;

  async function saveBudgets() {
    setBusy(true);
    const budgets = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v) > 0 ? Number(v) : null]));
    await fetch("/api/budgets", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ budgets }) });
    await ctx.reload();
    setBusy(false);
    ctx.toast("Budget saved");
  }

  async function saveGoal() {
    setBusy(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "goal", value: { name: goalName.trim() || "Savings goal", amount: Number(goalAmt) || 0 } }),
    });
    await ctx.reload();
    setBusy(false);
    ctx.toast("Goal saved");
  }

  return (
    <div className="stack">
      <section className="panel stack">
        <div>
          <h2>Savings goal</h2>
          <p className="muted">What are you saving towards? Progress counts money in minus money out across everything you've uploaded.</p>
        </div>
        {goal?.amount ? (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row between">
              <strong>{goal.name}</strong>
              <span className="num">
                {money(saved, false)} / {money(goal.amount, false)}
              </span>
            </div>
            <div className="goal-bar" role="progressbar" aria-valuenow={saved} aria-valuemin={0} aria-valuemax={goal.amount}>
              <span style={{ width: `${Math.min(100, (saved / goal.amount) * 100)}%` }} />
            </div>
            {hist && hist.net < 0 && <p className="faint">You're {money(hist.net)} in the red so far, so the bar is empty. A month in the green moves it.</p>}
          </div>
        ) : null}
        <div className="row wrap">
          <input className="input" style={{ flex: "2 1 200px", width: "auto" }} placeholder="e.g. Emergency fund, Japan trip" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
          <input className="input num" style={{ flex: "1 1 120px", width: "auto" }} type="number" min={0} placeholder="Amount ($)" value={goalAmt} onChange={(e) => setGoalAmt(e.target.value)} />
          <button className="btn" onClick={saveGoal} disabled={busy || !(Number(goalAmt) > 0)}>
            Save goal
          </button>
        </div>
      </section>

      <section className="panel stack">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <div>
            <h2>Monthly budget</h2>
            <p className="muted">
              Set a limit per category. Finishing a month under budget earns XP and keeps your streak alive.
            </p>
          </div>
        </div>
        {hist && (
          <button
            className="btn ghost small"
            style={{ justifySelf: "start" }}
            onClick={() => {
              const s = suggestBudgets(data);
              setVals((v) => ({ ...v, ...Object.fromEntries(Object.entries(s).map(([k, n]) => [k, String(n)])) }));
            }}
          >
            Fill in suggestions from my spending
          </button>
        )}
        <table className="data">
          <thead>
            <tr>
              <th>Category</th>
              <th className="r">Your average</th>
              <th className="r" style={{ width: 130 }}>
                Budget / month
              </th>
            </tr>
          </thead>
          <tbody>
            {SPEND_CATEGORIES.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.emoji} {c.label}
                </td>
                <td className="r muted">{hist ? money(monthlyAvg(c.id), false) : "—"}</td>
                <td className="r">
                  <input
                    className="input num"
                    style={{ padding: "6px 8px", textAlign: "right" }}
                    type="number"
                    min={0}
                    aria-label={`${c.label} budget`}
                    value={vals[c.id] ?? ""}
                    placeholder="No limit"
                    onChange={(e) => setVals((v) => ({ ...v, [c.id]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Total</strong>
              </td>
              <td className="r muted">{hist ? money(avgTotal, false) : "—"}</td>
              <td className="r">
                <strong className="num">{money(total, false)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        {hist && avgIncome > 0 && total > 0 && (
          <p className={total < avgIncome ? "muted" : "err"}>
            {total < avgIncome
              ? `At this budget you'd keep about ${money(avgIncome - total, false)} a month, based on your average money in of ${money(avgIncome, false)}.`
              : `This budget is higher than your average money in (${money(avgIncome, false)}/month).`}
          </p>
        )}
        {hist && hist.days < 28 && (
          <p className="faint">Averages are scaled up from {hist.days} days of data, so one-off bills weigh heavily. They'll settle as you add more months.</p>
        )}
        <button className="btn" style={{ justifySelf: "start" }} onClick={saveBudgets} disabled={busy}>
          Save budget
        </button>
      </section>
    </div>
  );
}
