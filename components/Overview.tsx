"use client";
import { useMemo, useState } from "react";
import { healthScore, money, monthLabel, opportunities, Player, summarize, totalBudget } from "@/lib/analysis";
import { cat } from "@/lib/categories";
import type { Ctx } from "./App";
import { CategoryBars, DailyChart, PeriodPicker, questFromOpportunity, usePeriods } from "./shared";

export function PlayerCard({ p }: { p: Player }) {
  const span = p.levelCeil - p.levelFloor;
  const pct = span ? ((p.xp - p.levelFloor) / span) * 100 : 0;
  return (
    <section className="player" aria-label="Your progress">
      <div className="row" style={{ alignItems: "flex-end", gap: 14 }}>
        <div className="lvl" aria-label={`Level ${p.level}`}>
          Lv{p.level}
        </div>
        <div>
          <div className="title">{p.title}</div>
          <div className="sub num">
            {p.xp} XP · {p.levelCeil - p.xp} XP to level {p.level + 1}
          </div>
        </div>
      </div>
      <div className="xpbar" role="progressbar" aria-valuemin={p.levelFloor} aria-valuemax={p.levelCeil} aria-valuenow={p.xp}>
        <span style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      <div className="player-stats">
        <div>
          <b>{p.streak}</b>month streak
        </div>
        <div>
          <b>
            {p.badges.filter((b) => b.earned).length}/{p.badges.length}
          </b>
          badges
        </div>
      </div>
    </section>
  );
}

export default function Overview({ ctx, p }: { ctx: Ctx; p: Player }) {
  const { data } = ctx;
  const { periods, period, setKey } = usePeriods(data);
  const s = useMemo(() => (period ? summarize(data.transactions, period) : null), [data, period]);
  const opps = useMemo(() => (s ? opportunities(s) : []), [s]);
  const [busy, setBusy] = useState<string>("");

  if (!data.transactions.length || !s || !period) {
    return (
      <div className="stack">
        <PlayerCard p={p} />
        <div className="panel empty">
          <div className="big">📥</div>
          <h2>Start your first run</h2>
          <p className="muted">Upload a bank statement PDF and the app will sort every transaction into categories, then show you where your money goes.</p>
          <button className="btn" onClick={() => ctx.go("upload")}>
            Upload a statement
          </button>
        </div>
      </div>
    );
  }

  const health = healthScore(s, data.budgets);
  const tb = totalBudget(data.budgets);
  const periodBudget = tb ? (tb * s.days) / 30.4 : 0;
  const totalSave = opps.reduce((a, o) => a + o.monthlySaving, 0);
  const questKeys = new Set(data.quests.map((q) => q.category + q.month));

  async function startQuest(o: (typeof opps)[number]) {
    if (!s) return;
    setBusy(o.id);
    const q = questFromOpportunity(o, s, data);
    await fetch("/api/quests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q) });
    await ctx.reload();
    setBusy("");
    ctx.toast(`Quest accepted for ${monthLabel(q.month)}: keep ${cat(q.category).label} under ${money(q.target, false)}`);
  }

  return (
    <div className="stack">
      <PlayerCard p={p} />

      <div className="row between wrap">
        <PeriodPicker periods={periods} value={period} onChange={setKey} />
        <span className="faint">
          {s.days} day{s.days === 1 ? "" : "s"} of data · {s.txs.length} transactions
        </span>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="v">{money(s.spend)}</div>
          <div className="l">
            Spent{periodBudget ? ` of ${money(periodBudget, false)} budget` : ""}
          </div>
        </div>
        <div className="stat">
          <div className="v">{money(s.income)}</div>
          <div className="l">Money in</div>
        </div>
        <div className="stat">
          <div className="v" style={{ color: s.net >= 0 ? "var(--good)" : "var(--bad)" }}>
            {s.net >= 0 ? "+" : "−"}
            {money(s.net)}
          </div>
          <div className="l">{s.net >= 0 ? "Saved" : "Overspent"}</div>
        </div>
        <div className="stat" title={health.notes.join("\n") || "Looking healthy"}>
          <div className="v pixel">{health.score}</div>
          <div className="l">Health score / 100</div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="section-head">
            <h2>Where it went</h2>
            {tb === 0 && (
              <button className="link-btn" onClick={() => ctx.go("budget")}>
                Set budgets
              </button>
            )}
          </div>
          <CategoryBars s={s} budgets={data.budgets} />
          {tb > 0 && s.days < 28 && (
            <p className="faint" style={{ marginTop: 12 }}>
              Budget markers are pro-rated to the {s.days} days of data in this period.
            </p>
          )}
        </section>

        <div className="stack">
          <section className="panel">
            <div className="section-head">
              <h2>Where to save</h2>
              {totalSave > 0 && <span className="pill good">up to {money(totalSave, false)}/mo</span>}
            </div>
            {opps.length === 0 && <p className="muted">Nothing stands out — your spending looks lean for this period.</p>}
            {opps.map((o) => {
              const taken = o.category ? questKeys.has(o.category + questFromOpportunity(o, s, data).month) : false;
              return (
                <div className="opp" key={o.id}>
                  <span className="emo" aria-hidden>
                    {o.emoji}
                  </span>
                  <h3>{o.title}</h3>
                  <p className="muted" style={{ fontSize: "0.9rem" }}>
                    {o.detail}
                  </p>
                  <div className="actions">
                    {o.monthlySaving > 0 && <span className="save">Save ≈ {money(o.monthlySaving, false)}/month</span>}
                    {o.category && (
                      <button className="btn small gold" disabled={taken || busy === o.id} onClick={() => startQuest(o)}>
                        {taken ? "Quest active" : busy === o.id ? "Accepting…" : "Accept quest"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="panel">
            <h2 style={{ marginBottom: 8 }}>Spending per day</h2>
            <DailyChart s={s} />
          </section>
        </div>
      </div>

      <section className="panel">
        <h2 style={{ marginBottom: 8 }}>Top places</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Merchant</th>
              <th className="r">Visits</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {s.topMerchants.map((m) => (
              <tr key={m.merchant}>
                <td>
                  {cat(m.category).emoji} {m.merchant}
                </td>
                <td className="r">{m.count}</td>
                <td className="r">{money(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
