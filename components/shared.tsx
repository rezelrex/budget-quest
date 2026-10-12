"use client";
import { useEffect, useMemo, useState } from "react";
import { AppData, buildPeriods, dataRange, money, nextMonth, Opportunity, Period, shortDate, Summary, periodBudget } from "@/lib/analysis";
import { cat, CategoryId } from "@/lib/categories";

export function usePeriods(data: AppData) {
  const periods = useMemo(() => buildPeriods(data), [data]);
  const [key, setKey] = useState<string>("");
  useEffect(() => {
    if (!periods.find((p) => p.key === key) && periods.length) setKey(periods[0].key);
  }, [periods, key]);
  const period = periods.find((p) => p.key === key) ?? periods[0];
  return { periods, period, setKey };
}

export function PeriodPicker({ periods, value, onChange }: { periods: Period[]; value?: Period; onChange: (k: string) => void }) {
  if (!periods.length) return null;
  const statements = periods.filter((p) => p.kind === "statement");
  const months = periods.filter((p) => p.kind === "month");
  return (
    <select className="select" aria-label="Period" value={value?.key} onChange={(e) => onChange(e.target.value)}>
      {statements.length > 0 && (
        <optgroup label="Statements">
          {statements.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label.replace("Statement: ", "")}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Calendar months">
        {months.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </optgroup>
      <option value="all">All time</option>
    </select>
  );
}

/** Horizontal magnitude bars — one hue; the black tick marks the (pro-rated) budget. */
export function CategoryBars({ s, budgets }: { s: Summary; budgets: AppData["budgets"] }) {
  if (!s.byCategory.length) return <p className="muted">No spending in this period.</p>;
  const max = Math.max(
    ...s.byCategory.map((c) => Math.max(c.total, periodBudget(budgets, c.id, s.days) ?? 0))
  );
  return (
    <div className="cat-list">
      {s.byCategory.map((c) => {
        const b = periodBudget(budgets, c.id, s.days);
        const over = b !== null && c.total > b;
        const pct = s.spend ? Math.round((c.total / s.spend) * 100) : 0;
        return (
          <div className="cat-row" key={c.id}>
            <span className="emo" aria-hidden>
              {cat(c.id).emoji}
            </span>
            <span className="name">{cat(c.id).label}</span>
            <span className="amt">{money(c.total)}</span>
            <div className="track" title={`${cat(c.id).label}: ${money(c.total)} across ${c.count} transactions${b !== null ? `, budget ${money(b)}` : ""}`}>
              <div className={`fill ${over ? "over" : ""}`} style={{ width: `${(c.total / max) * 100}%` }} />
              {b !== null && <div className="tick" style={{ left: `calc(${(b / max) * 100}% - 1px)` }} />}
            </div>
            <div className="meta">
              <span>
                {c.count} × · {pct}% of spending
              </span>
              {b !== null && (
                <span className={`pill ${over ? "bad" : "good"}`}>
                  {over ? `▲ ${money(c.total - b, false)} over` : `✓ ${money(b - c.total, false)} left`}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DailyChart({ s }: { s: Summary }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = s.daily;
  if (days.length < 2) return null;
  const W = 600, H = 140, pad = 2;
  const max = Math.max(...days.map((d) => d.total), 1);
  const bw = W / days.length;
  const avg = s.spend / Math.max(s.days, 1);
  const peak = days.reduce((a, d) => (d.total > a.total ? d : a), days[0]);
  const h = hover !== null ? days[hover] : null;
  return (
    <div className="daily">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Spending per day">
        <line className="axis" x1={0} x2={W} y1={H} y2={H} />
        {days.map((d, i) => {
          const bh = (d.total / max) * (H - 8);
          return (
            <rect
              key={d.date}
              className={`bar ${hover !== null && hover !== i ? "dim" : ""}`}
              x={i * bw + pad / 2}
              y={H - bh}
              width={Math.max(bw - pad, 1)}
              height={bh}
              rx={Math.min(3, bw / 4)}
            />
          );
        })}
        <line className="avg" x1={0} x2={W} y1={H - (avg / max) * (H - 8)} y2={H - (avg / max) * (H - 8)} vectorEffect="non-scaling-stroke" />
        {days.map((d, i) => (
          <rect
            key={"h" + d.date}
            className="hit"
            x={i * bw}
            y={0}
            width={bw}
            height={H}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(i === hover ? null : i)}
          />
        ))}
      </svg>
      <p className="daily-readout num">
        {h
          ? `${shortDate(h.date)}: ${money(h.total)}`
          : `Average ${money(avg)}/day (dashed line) · busiest day ${shortDate(peak.date)} at ${money(peak.total)}`}
      </p>
    </div>
  );
}

/** New quests target the month after your latest data, so spending from before you accepted never counts against you. */
export function questMonth(data: AppData): string {
  const r = dataRange(data.transactions);
  if (!r) return new Date().toISOString().slice(0, 7);
  return nextMonth(r.max.slice(0, 7));
}

export function questFromOpportunity(o: Opportunity, s: Summary, data: AppData) {
  const c = s.byCategory.find((x) => x.id === o.category);
  const baseline = Math.round(((c?.total ?? 0) * 30.4) / Math.max(s.days, 1));
  const target = Math.max(0, Math.floor((baseline * (1 - (o.cut ?? 0.2))) / 5) * 5);
  return {
    category: o.category as CategoryId,
    title: o.title,
    baseline,
    target,
    month: questMonth(data),
  };
}
